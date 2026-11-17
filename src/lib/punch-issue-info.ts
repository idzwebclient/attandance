import type { Tone } from "./format";

// Plain explanation and the fix to tell the staff, per punch problem code.
// Server codes come from submit_attendance; device codes from the app (punch-issues.ts).
export const PUNCH_ISSUE_INFO: Record<string, { label: string; tone: Tone; fix: string }> = {
  // Phone / camera
  CAMERA_DENIED: {
    label: "Kebenaran kamera ditolak",
    tone: "bad",
    fix: "iPhone: Settings → Safari → Camera → Allow. Android Chrome: tekan ikon di sebelah alamat laman → Permissions → Camera → Allow. Kemudian buka semula app.",
  },
  CAMERA_UNAVAILABLE: {
    label: "Kamera tak dapat dibuka",
    tone: "bad",
    fix: "Tutup app lain yang guna kamera (WhatsApp, kamera, video call), kemudian cuba lagi. Jika masih gagal, restart telefon.",
  },
  NO_CAMERA: {
    label: "Kamera tak dijumpai",
    tone: "bad",
    fix: "Peranti ini tiada kamera atau browser tak benarkan. Guna telefon lain atau browser Chrome / Safari.",
  },
  NOT_BRANCH_QR: {
    label: "Imbas QR yang salah",
    tone: "warn",
    fix: "Staff imbas QR lain (bukan QR kehadiran). Pastikan QR cawangan ditampal jelas dan tiada QR lain di sebelahnya.",
  },
  SCAN_CANCELLED: {
    label: "Kamera buka, QR tak dapat dibaca",
    tone: "warn",
    fix: "Biasanya QR kabur, berkilat, rosak, terlalu kecil atau terlalu jauh. Cetak semula QR (lebih besar, kertas tak berkilat) dan pastikan cahaya cukup.",
  },
  // Phone / GPS
  LOCATION_DENIED: {
    label: "Kebenaran lokasi ditolak",
    tone: "bad",
    fix: "iPhone: Settings → Privacy → Location Services → ON, dan Safari Websites → While Using. Android: hidupkan Location, dan benarkan lokasi untuk laman ini dalam Chrome.",
  },
  LOCATION_TIMEOUT: {
    label: "GPS lambat sangat",
    tone: "warn",
    fix: "Minta staff keluar dari sudut tertutup, tunggu sekejap dan cuba lagi. Pastikan mod jimat bateri dimatikan.",
  },
  LOCATION_UNAVAILABLE: {
    label: "Lokasi tak dapat dibaca",
    tone: "bad",
    fix: "Hidupkan GPS / Location di telefon, kemudian cuba lagi.",
  },
  LOCATION_UNSUPPORTED: {
    label: "Browser tak sokong lokasi",
    tone: "bad",
    fix: "Guna Chrome (Android) atau Safari (iPhone) yang terkini.",
  },
  // Phone / network
  OFFLINE: {
    label: "Tiada internet",
    tone: "warn",
    fix: "Telefon tiada data / WiFi semasa punch. Hidupkan data atau sambung ke WiFi kedai.",
  },
  SERVER_UNREACHABLE: {
    label: "Server tak dapat dihubungi",
    tone: "warn",
    fix: "Internet lemah atau terputus. Cuba lagi selepas beberapa saat.",
  },
  SERVER_ERROR: {
    label: "Ralat sistem",
    tone: "bad",
    fix: "Ralat di pihak sistem. Hantar butiran ini kepada developer.",
  },
  // Refused by the server
  OUTSIDE_RADIUS: {
    label: "Di luar kawasan cawangan",
    tone: "bad",
    fix: "Tengok jarak. Jika staff memang di kedai tapi jarak besar, semak koordinat cawangan atau besarkan radius dalam Cawangan. Jika kerja di luar, beri Kerja luar.",
  },
  LOCATION_INACCURATE: {
    label: "GPS tak cukup tepat",
    tone: "warn",
    fix: "Ketepatan GPS lebih rendah daripada had. Minta staff hidupkan Precise Location / WiFi, atau naikkan had ketepatan dalam Tetapan.",
  },
  INVALID_QR: {
    label: "QR tidak sah",
    tone: "bad",
    fix: "QR lama atau cawangan tidak aktif. Cetak semula QR dari halaman Cawangan.",
  },
  QR_WRONG_BRANCH: {
    label: "QR cawangan lain",
    tone: "bad",
    fix: "Staff imbas QR cawangan lain. Semak cawangan staff dalam Pekerja, atau QR yang ditampal di kedai.",
  },
  NO_BRANCH: {
    label: "Tiada cawangan",
    tone: "bad",
    fix: "Tetapkan cawangan untuk staff ini dalam Pekerja.",
  },
  BRANCH_INACTIVE: {
    label: "Cawangan tidak aktif",
    tone: "bad",
    fix: "Aktifkan semula cawangan atau pindahkan staff ke cawangan lain.",
  },
  USER_INACTIVE: { label: "Akaun tidak aktif", tone: "bad", fix: "Aktifkan semula akaun dalam Pekerja." },
  ROLE_NOT_PERMITTED: { label: "Peranan tak boleh punch", tone: "neutral", fix: "Hanya staff dan manager boleh punch." },
  DUPLICATE_EVENT: {
    label: "Sudah direkod",
    tone: "neutral",
    fix: "Peringkat ini sudah direkod. Biasanya staff tekan dua kali. Tiada tindakan diperlukan.",
  },
  INVALID_SEQUENCE: {
    label: "Urutan salah",
    tone: "neutral",
    fix: "Staff tekan butang yang salah (contoh tamat rehat sebelum mula rehat). Betulkan rekod dalam Kehadiran jika perlu.",
  },
  DAY_COMPLETED: { label: "Hari sudah lengkap", tone: "neutral", fix: "Tiada tindakan diperlukan." },
  INTENT_REQUIRED: { label: "Tak pilih tindakan", tone: "neutral", fix: "Tiada tindakan diperlukan." },
};

export function punchIssueInfo(code: string) {
  return PUNCH_ISSUE_INFO[code] ?? { label: code, tone: "neutral" as Tone, fix: "" };
}

// Short "iPhone · Safari" style name from a browser user agent.
export function describeDevice(ua: string | null | undefined) {
  if (!ua) return null;
  const device = /iPhone/.test(ua)
    ? "iPhone"
    : /iPad/.test(ua)
      ? "iPad"
      : /Android/.test(ua)
        ? (ua.match(/Android [\d.]+; ([^;)]+?)(?: Build|\))/)?.[1]?.trim() || "Android")
        : /Macintosh/.test(ua)
          ? "Mac"
          : /Windows/.test(ua)
            ? "Windows"
            : "Lain-lain";
  // First match wins: in-app browsers (Instagram, Facebook, TikTok) often block the camera.
  const BROWSERS: [RegExp, string][] = [
    [/Instagram|FBAN|FBAV|FB_IAB|Line\/|TikTok|musical_ly/, "Browser dalam app"],
    [/SamsungBrowser/, "Samsung Internet"],
    [/EdgA?\//, "Edge"],
    [/CriOS|Chrome\//, "Chrome"],
    [/FxiOS|Firefox\//, "Firefox"],
    [/Safari\//, "Safari"],
  ];
  const browser = BROWSERS.find(([re]) => re.test(ua))?.[1];
  return browser ? `${device} · ${browser}` : device;
}
