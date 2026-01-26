export const SETTINGS_STORAGE_KEY = 'shri-renamer-settings';
export const THEME_STORAGE_KEY = 'shri-renamer-theme';
export const LAST_UPLOAD_STORAGE_KEY = 'shri-renamer-last-upload';
export const ANNOUNCE_BASE = 'https://shareisland.org/announce/';

export const UNIT3D_CATEGORY_ID = {
  MOVIE: '1',
  TV: '2'
};

export const SHRI_TYPE_ID = {
  DISC: '26',
  REMUX: '7',
  WEBDL: '27',
  WEBRIP: '15',
  HDTV: '33',
  ENCODE: '15',
  DVDRIP: '15',
  BRRIP: '15'
};

export const UNIT3D_RESOLUTION_ID = {
  '8640p': '10',
  '4320p': '1',
  '2160p': '2',
  '1440p': '3',
  '1080p': '3',
  '1080i': '4',
  '720p': '5',
  '576p': '6',
  '576i': '7',
  '480p': '8',
  '480i': '9'
};

export const DEFAULT_GROUP_TAGS = [
  'Blackbit',
  'G66',
  'Ubi',
  'Prometheus',
  'NST',
  'Ned',
  'GP',
  'NovaRip',
  'Odino',
  'CreW',
  'YELLO',
  'SpyRo',
  'iVy',
  'NTb',
  'Morpheus',
  'MRSK',
  'T7',
  'TrollHD',
  'B66',
  'P67',
  'MIKE',
  'TRiADE',
  'Vitello',
  'gattopollo',
  'SAW',
  'Jsph69',
  'Mem',
  'BORDURE',
  'GeD',
  'IlSommo',
  'Pir8',
  'successfulcrab',
  'AMBER',
  'Me7alh',
  'Pennywise',
  'ToVaR',
  'playWEB',
  'DSR',
  'M109',
  'TVSmash',
  'bamboozle',
  'ettv',
  'memento',
  'TOXiC',
  'ETHEL',
  'AMCON',
  'cielos',
  'Darksidemux',
  'ELiTE',
  'lucidtv',
  'METCON',
  'tbs',
  'FHC',
  'FraMeSToR',
  'EPSiLON',
  'CiNEPHiLES',
  'SGF',
  'EbP',
  'ZioRip',
  'TheEmojiCrew',
  'CYBER',
  'LFi',
  'Krikk',
  'SBuR',
  'CtrlHD',
  'iSlaNd',
  'PRiME',
  'NAHOM',
  'TMT'
];

export const LANG_MAP = {
  it: 'ITA',
  itit: 'ITA',
  ita: 'ITA',
  italian: 'ITA',
  italiano: 'ITA',
  en: 'ENG',
  enus: 'ENG',
  engb: 'ENG',
  enau: 'ENG',
  enca: 'ENG',
  enin: 'ENG',
  eng: 'ENG',
  english: 'ENG',
  fr: 'FRE',
  frfr: 'FRE',
  frca: 'FRE',
  fre: 'FRE',
  fra: 'FRE',
  french: 'FRE',
  de: 'GER',
  dede: 'GER',
  deat: 'GER',
  dech: 'GER',
  deu: 'GER',
  ger: 'GER',
  german: 'GER',
  es: 'SPA',
  eses: 'SPA',
  esmx: 'SPA',
  esar: 'SPA',
  spa: 'SPA',
  spanish: 'SPA',
  pt: 'POR',
  ptbr: 'POR',
  ptpt: 'POR',
  por: 'POR',
  portuguese: 'POR',
  ja: 'JPN',
  jajp: 'JPN',
  jpn: 'JPN',
  japanese: 'JPN',
  ru: 'RUS',
  ruru: 'RUS',
  rus: 'RUS',
  russian: 'RUS',
  zh: 'CHI',
  zhcn: 'CHI',
  zhtw: 'CHI',
  zhhk: 'CHI',
  zho: 'CHI',
  chi: 'CHI',
  chinese: 'CHI',
  ko: 'KOR',
  kokr: 'KOR',
  kor: 'KOR',
  korean: 'KOR',
  uk: 'UKR',
  ukua: 'UKR',
  ukr: 'UKR',
  ukrainian: 'UKR',
  nl: 'NLD',
  nld: 'NLD',
  dutch: 'NLD',
  pl: 'POL',
  pol: 'POL',
  polish: 'POL',
  sv: 'SWE',
  swe: 'SWE',
  swedish: 'SWE'
};

export const RULES_SECTIONS = [
  {
    title: 'Regole generali',
    items: [
      {
        label: 'Separatore file/cartelle',
        pattern: 'Usiamo il punto "." tra i token. Stagione/Episodio: S01E01.'
      },
      {
        label: 'Lingue audio',
        pattern: 'Tag in maiuscolo, più lingue separate da "-": ITA-ENG / ITA-MULTI.'
      },
      {
        label: 'Tag gruppo',
        pattern: 'Aggiunto in coda con trattino: ... VCodec-Tag.'
      }
    ]
  },
  {
    title: 'Film',
    items: [
      {
        label: 'WEB-DL / WEBRip',
        pattern:
          'Titolo Anno LINGUA Edizione Hybrid Repack Risoluzione UHD Servizio WEB-DL ACodec Canali Meta HDR VCodec-Tag'
      },
      {
        label: 'Encode',
        pattern:
          'Titolo Anno LINGUA Edizione Hybrid Repack Risoluzione UHD Src ACodec Canali Meta HDR VCodec-Tag'
      },
      {
        label: 'Remux',
        pattern:
          'Titolo Anno 3D LINGUA Edizione Hybrid Repack Risoluzione UHD Src REMUX HDR VCodec ACodec Canali Meta-Tag'
      },
      {
        label: 'Full Disc',
        pattern:
          'Titolo Anno 3D Edizione Repack Risoluzione Regione UHD Src HDR VCodec ACodec Canali Meta-Tag'
      }
    ]
  },
  {
    title: 'Serie TV - Stagioni',
    items: [
      {
        label: 'WEB-DL / WEBRip',
        pattern:
          'Titolo Anno S## LINGUA Edizione Hybrid Repack Risoluzione UHD Servizio WEB-DL ACodec Canali Meta HDR VCodec-Tag'
      },
      {
        label: 'Encode',
        pattern:
          'Titolo Anno S## LINGUA Edizione Hybrid Repack Risoluzione UHD Src ACodec Canali Meta HDR VCodec-Tag'
      },
      {
        label: 'Remux',
        pattern:
          'Titolo Anno S## 3D LINGUA Edizione Hybrid Repack Risoluzione UHD Src REMUX HDR VCodec ACodec Canali Meta-Tag'
      },
      {
        label: 'Full Disc',
        pattern:
          'Titolo Anno S## 3D Edizione Repack Risoluzione Regione UHD Src HDR VCodec ACodec Canali Meta-Tag'
      }
    ]
  },
  {
    title: 'Serie TV - Episodi',
    items: [
      {
        label: 'WEB-DL / WEBRip',
        pattern:
          'Titolo Anno S##E## Tit_Ep Parte LINGUA Edizione Hybrid Repack Risoluzione UHD Servizio WEB-DL ACodec Canali Meta HDR VCodec-Tag'
      },
      {
        label: 'Encode',
        pattern:
          'Titolo Anno S##E## Tit_Ep Parte LINGUA Edizione Hybrid Repack Risoluzione UHD Src ACodec Canali Meta HDR VCodec-Tag'
      },
      {
        label: 'Remux',
        pattern:
          'Titolo Anno S##E## Tit_Ep Parte 3D LINGUA Edizione Hybrid Repack Risoluzione UHD Src REMUX HDR VCodec ACodec Canali Meta-Tag'
      }
    ]
  }
];

export const AUDIO_CODEC_SCORE = {
  'DTS:X': 90,
  'TrueHD': 88,
  'DTS-HD MA': 86,
  'FLAC': 80,
  'DTS-HD HRA': 75,
  'DTS': 70,
  'DD+': 65,
  'DD': 60,
  'AAC': 50,
  'OPUS': 45
};

export const STOP_WORDS = new Set([
  '2160P', '1080P', '720P', '576P', '480P',
  '4K', '8K',
  'WEB', 'WEBDL', 'WEB-DL', 'WEBRIP', 'WEBRIP',
  'BLURAY', 'BLU-RAY', 'REMUX', 'UHD', 'HDR', 'HDR10', 'HDR10+', 'DV', 'DOVI',
  'X264', 'X265', 'H264', 'H265', 'HEVC', 'AVC', 'AV1',
  'DTS', 'DTS-HD', 'DTSHD', 'TRUEHD', 'AAC', 'DD', 'DDP', 'EAC3', 'AC3', 'FLAC',
  'ATMOS', 'AURO3D', 'IMAX', 'EXTENDED', 'REPACK', 'PROPER', 'RERIP',
  'MULTI', 'ITA', 'ENG', 'FRE', 'GER', 'SPA', 'POR', 'JPN', 'RUS', 'CHI', 'KOR', 'UKR', 'NLD', 'POL', 'SWE'
]);
