module.exports = {
  getLyrics: async function(track) {
    if (!track || !track.title) return null;
    var title = cleanTitle(track.title);
    var artist = cleanArtist(track.artist || "");
    var durationSec = Math.floor((track.durationMs || 0) / 1000);

    // 1. SpotiFLAC proxy method (word-synced LRC)
    try {
      var proxyUrl = "https://lyrics.paxsenix.org/musixmatch/lyrics?t=" + encodeURIComponent(title) +
                     "&a=" + encodeURIComponent(artist) +
                     "&type=word&format=lrc" +
                     (durationSec > 0 ? ("&d=" + durationSec) : "");
      var proxyRes = await fetch(proxyUrl, {
        headers: { "User-Agent": "MusicBeat/1.0 (Android)" }
      });
      if (proxyRes.ok) {
        var text = proxyRes.text();
        if (text && text.trim() && !text.startsWith("{") && !text.startsWith("<") && !isFakeLyrics(text)) {
          return text.trim();
        }
      }
    } catch (e) {}

    // 2. Desktop API fallback
    try {
      var token = await getToken();
      if (token && !token.startsWith("00000000")) {
        var url = "https://apic-desktop.musixmatch.com/ws/1.1/macro.subtitles.get?format=json" +
                  "&q_track=" + encodeURIComponent(title) +
                  "&q_artist=" + encodeURIComponent(artist) +
                  (durationSec > 0 ? ("&f_subtitle_length=" + durationSec) : "") +
                  "&usertoken=" + encodeURIComponent(token) +
                  "&app_id=web-desktop-app-v1.0";

        var res = await fetch(url);
        if (res.ok) {
          var data = res.json();
          var macro = data && data.message && data.message.body && data.message.body.macro_calls;
          if (macro) {
            var sub = macro["track.subtitles.get"];
            var subBody = sub && sub.message && sub.message.body && sub.message.body.subtitle_list;
            if (Array.isArray(subBody) && subBody.length > 0) {
              var subtitle = subBody[0] && subBody[0].subtitle;
              if (subtitle && subtitle.subtitle_body && !isFakeLyrics(subtitle.subtitle_body)) {
                return subtitle.subtitle_body;
              }
            }
          }
        }
      }
    } catch (e) {}

    return null;
  },

  searchLyrics: async function(query) {
    var lrc = await module.exports.getLyrics(query);
    if (!lrc) return [];
    return [{
      id: "musixmatch_" + encodeURIComponent((query.title || "").trim()),
      title: query.title || "",
      artist: query.artist || "",
      album: query.album || "",
      durationSeconds: Math.floor((query.durationMs || 0) / 1000),
      provider: "Musixmatch",
      syncedLyrics: lrc,
      plainLyrics: null
    }];
  }
};

function isFakeLyrics(text) {
  if (!text) return true;
  // Musixmatch returns this exact honeypot / gibberish text when unauthenticated
  if (text.indexOf("Wob gopini") !== -1 || text.indexOf("Tefe woxica") !== -1 || text.indexOf("Gogoh vudob") !== -1) {
    return true;
  }
  return false;
}

var cachedToken = null;
async function getToken() {
  if (cachedToken) return cachedToken;
  try {
    var url = "https://apic-desktop.musixmatch.com/ws/1.1/token.get?app_id=web-desktop-app-v1.0";
    var res = await fetch(url);
    if (!res.ok) return null;
    var data = res.json();
    var token = data && data.message && data.message.body && data.message.body.user_token;
    if (token && token !== "Upgrade.Me" && !token.startsWith("00000000")) {
      cachedToken = token;
      return token;
    }
  } catch (e) {}
  return null;
}

function cleanTitle(t) {
  return t.replace(/\((?:feat\.?|official|video|audio|remix)[^)]*\)/gi, " ")
          .replace(/\[[^\]]*\]/g, " ")
          .replace(/\s+/g, " ")
          .trim();
}

function cleanArtist(a) {
  return a.split(/[,&/]/)[0].trim();
}
