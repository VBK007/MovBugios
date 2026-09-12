import { CastDevice, makeProfile, Profile } from '@/domain/model/people';
import {
  Chapter,
  directPlay,
  makeFileSpec,
  makeSubtitleTrack,
  makeTitle,
  Title,
  transcode,
} from '@/domain/model/media';
import { JumpTarget, LibrarySummary, Timeline } from '@/domain/model/library';
import { SavedItem, SavedSummary, Done } from '@/domain/model/downloads';

/**
 * The library from the approved design board, verbatim where the board named a
 * number. Previews and the fake repository both read from here, so a screenshot
 * and the running app show the same disk.
 *
 * Ported from data/fake/SampleLibrary.kt.
 */

const GB = 1_073_741_824;
const TB = 1_099_511_627_776;

// --- Profiles ----------------------------------------------------------

export const arun: Profile = makeProfile({
  id: 'p-arun',
  name: 'Arun',
  avatarTint: '#E8B34A',
  isOwner: true,
});
export const meera: Profile = makeProfile({
  id: 'p-meera',
  name: 'Meera',
  avatarTint: '#6A8FD4',
});
export const kids: Profile = makeProfile({
  id: 'p-kids',
  name: 'Kids',
  ageMode: 'YOUNG',
  avatarTint: '#7EC9A0',
});
export const guest: Profile = makeProfile({
  id: 'p-guest',
  name: 'Guest',
  avatarTint: '#B06A8F',
});

export const profiles: Profile[] = [arun, meera, kids, guest];

// --- Artwork -----------------------------------------------------------

/**
 * Stand-in artwork for the sample library, from Lorem Picsum.
 *
 * Open-licensed photographs (Unsplash's catalogue, served without a key or an
 * account), not film posters — a real poster is somebody's copyright, and
 * shipping ten of them inside an app to make a demo look nicer is not a trade
 * worth making.
 *
 * Seeded by title, so a given film always draws the same picture: sample data
 * that reshuffles itself between launches makes every screenshot a different app.
 *
 * Failing is safe. The poster component paints the generated gradient underneath
 * and it stays there while this loads and if it never does — so the sample
 * library offline looks exactly as it did before any of this, which is the whole
 * point of it working without a server.
 */
const poster = (seed: string) => `https://picsum.photos/seed/${seed}/400/600`;
const backdrop = (seed: string) => `https://picsum.photos/seed/${seed}-wide/960/540`;

// --- Titles ------------------------------------------------------------

export const nightfallDrive: Title = makeTitle({
  id: 't-nightfall',
  posterUrl: poster('nightfall'),
  backdropUrl: backdrop('nightfall'),
  name: 'Nightfall Drive',
  year: 2019,
  kind: 'FILM',
  runtimeMinutes: 118,
  genres: ['Thriller'],
  rating: 7.8,
  synopsis:
    'A courier with one delivery left drives the coast road at night and finds the cargo has ' +
    'other plans. Slow, blue, and very loud in the last ten minutes. What begins as a job ' +
    'becomes an argument with everyone she used to be, conducted at ninety miles an hour with ' +
    'the windows down.',
  tagline: 'One road. One night. No turning back.',
  certification: '15',
  studio: 'Harbour Line Pictures',
  imdbId: 'tt4123890',
  directors: ['Ana Beltrán'],
  cast: ['Marguerite Osei', 'Tom Halloran', 'Priya Raghunathan', 'Set Okonkwo', 'Lena Vasquez'],
  file: makeFileSpec({
    filename: 'Nightfall.Drive.2019.1080p.BluRay.x264.mkv',
    directory: '/mnt/tower/films/',
    container: 'MKV',
    videoCodec: 'H.264',
    width: 1920,
    height: 1080,
    sizeBytes: 4.2 * GB,
    audioCodecs: 'AC3',
    audioChannels: 6,
    audioLanguages: ['EN', 'HI'],
    bitrateBitsPerSecond: 18_400_000,
    probed: true,
  }),
  watchState: 'IN_PROGRESS',
  positionSeconds: 4564, // 1:16:04
  durationSeconds: 7080,
  plan: directPlay({
    resolution: '1080p',
    bitrateMbps: 18.4,
    reasons: ['This phone decodes H.264 in MKV natively.'],
  }),
  savedOnDevice: true,
  subtitles: [
    makeSubtitleTrack({ index: 0, language: 'English', format: 'SRT', lineCount: 1204 }),
    makeSubtitleTrack({ index: 1, language: 'Hindi', format: 'SRT', forced: true }),
  ],
  audioTracks: [
    { index: 0, codec: 'AC3', language: 'en', title: 'EN 5.1' },
    { index: 1, codec: 'AAC', language: 'hi', title: 'HI 2.0' },
  ],
});

export const copperSky: Title = makeTitle({
  id: 't-copper-sky',
  posterUrl: poster('copper-sky'),
  backdropUrl: backdrop('copper-sky'),
  name: 'Copper Sky',
  year: 2023,
  kind: 'FILM',
  runtimeMinutes: 112,
  genres: ['Drama'],
  rating: 7.1,
  synopsis:
    'Two estranged brothers repair a roof over one long summer and talk about almost ' +
    'everything else.',
  file: makeFileSpec({
    filename: 'Copper.Sky.2023.2160p.WEB-DL.x265.10bit.mkv',
    directory: '/mnt/tower/films/',
    container: 'MKV',
    videoCodec: 'HEVC',
    width: 3840,
    height: 2160,
    sizeBytes: 22.4 * GB,
    audioCodecs: 'EAC3',
    audioChannels: 6,
    audioLanguages: ['EN'],
    bitrateBitsPerSecond: 48_000_000,
    probed: true,
  }),
  plan: transcode({
    fromResolution: '2160p',
    toResolution: '1080p',
    reasons: ['This phone cannot decode HEVC 10-bit, so the server re-encodes.'],
  }),
});

export const kiteSeason: Title = makeTitle({
  id: 't-kite-season',
  posterUrl: poster('kite-season'),
  backdropUrl: backdrop('kite-season'),
  name: 'Kite Season',
  year: 2024,
  kind: 'ANIME',
  runtimeMinutes: 24,
  genres: ['Anime'],
  rating: 8.2,
  synopsis:
    'A seaside town, one long summer, and a competition nobody takes seriously until they do.',
  file: makeFileSpec({
    filename: 'Kite.Season.S01E04.1080p.mkv',
    directory: '/mnt/tower/anime/',
    container: 'MKV',
    videoCodec: 'H.264',
    width: 1920,
    height: 1080,
    sizeBytes: 1.4 * GB,
    audioLanguages: ['JA', 'EN'],
    bitrateBitsPerSecond: 8_200_000,
    probed: true,
  }),
  watchState: 'IN_PROGRESS',
  positionSeconds: 492, // 08:12
  durationSeconds: 1440,
  plan: directPlay({ resolution: '1080p', bitrateMbps: 8.2 }),
});

export const ironGarden: Title = makeTitle({
  id: 't-iron-garden',
  posterUrl: poster('iron-garden'),
  backdropUrl: backdrop('iron-garden'),
  name: 'Iron Garden',
  year: 2021,
  kind: 'FILM',
  runtimeMinutes: 104,
  genres: ['Adventure'],
  rating: 7.4,
  synopsis: 'A botanist inherits a walled garden that has been growing without her.',
  file: makeFileSpec({
    filename: 'Iron.Garden.2021.1080p.mkv',
    directory: '/mnt/tower/films/',
    container: 'MKV',
    videoCodec: 'H.264',
    width: 1920,
    height: 1080,
    sizeBytes: 5.1 * GB,
    audioLanguages: ['EN'],
    probed: true,
  }),
  plan: directPlay({ resolution: '1080p', bitrateMbps: 11.0 }),
});

export const theLongReturn: Title = makeTitle({
  id: 't-long-return',
  posterUrl: poster('long-return'),
  backdropUrl: backdrop('long-return'),
  name: 'The Long Return',
  year: 2020,
  kind: 'FILM',
  runtimeMinutes: 101,
  genres: ['Drama'],
  rating: 7.0,
  file: makeFileSpec({
    filename: 'The.Long.Return.2020.1080p.mkv',
    directory: '/mnt/tower/films/',
    container: 'MKV',
    videoCodec: 'H.264',
    width: 1920,
    height: 1080,
    sizeBytes: 6.3 * GB,
    audioLanguages: ['EN'],
    probed: true,
  }),
  watchState: 'IN_PROGRESS',
  positionSeconds: 2052, // 34:12
  durationSeconds: 6060,
  plan: directPlay({ resolution: '1080p', bitrateMbps: 12.4 }),
});

export const neonFable: Title = makeTitle({
  id: 't-neon-fable',
  posterUrl: poster('neon-fable'),
  backdropUrl: backdrop('neon-fable'),
  name: 'Neon Fable',
  year: 2022,
  kind: 'FILM',
  runtimeMinutes: 96,
  genres: ['Fantasy'],
  file: makeFileSpec({
    filename: 'Neon.Fable.2022.1080p.mkv',
    directory: '/mnt/tower/films/',
    container: 'MKV',
    videoCodec: 'H.264',
    width: 1920,
    height: 1080,
    sizeBytes: 4.8 * GB,
    probed: true,
  }),
  plan: directPlay({ resolution: '1080p', bitrateMbps: 10.2 }),
});

export const nightDrive: Title = makeTitle({
  id: 't-night-drive',
  posterUrl: poster('night-drive'),
  backdropUrl: backdrop('night-drive'),
  name: 'Night Drive',
  year: 2020,
  kind: 'FILM',
  runtimeMinutes: 88,
  genres: ['Thriller'],
  file: makeFileSpec({
    filename: 'Night.Drive.2020.720p.mkv',
    directory: '/mnt/tower/films/',
    container: 'MKV',
    videoCodec: 'H.264',
    width: 1280,
    height: 720,
    sizeBytes: 2.1 * GB,
    probed: true,
  }),
  plan: directPlay({ resolution: '720p', bitrateMbps: 6.0 }),
});

// --- Home videos -------------------------------------------------------

export const goaDayTwo: Title = makeTitle({
  id: 't-goa-2',
  posterUrl: poster('goa-two'),
  backdropUrl: backdrop('goa-two'),
  name: 'Goa, day two',
  year: 2024,
  kind: 'HOME_VIDEO',
  runtimeMinutes: 18,
  file: makeFileSpec({
    filename: 'PXL_20241214_093122.mp4',
    directory: '/mnt/tower/ours/2024/',
    container: 'MP4',
    videoCodec: 'H.264',
    width: 1920,
    height: 1080,
    sizeBytes: 3.2 * GB,
    probed: true,
  }),
  plan: directPlay({ resolution: '1080p', bitrateMbps: 24.0 }),
  savedOnDevice: true,
  capturedAt: '2024-12-14',
  place: 'Goa',
  people: ['Arun', 'Meera', 'Kids'],
});

export const sportsDay: Title = makeTitle({
  id: 't-sports-day',
  posterUrl: poster('sports-day'),
  backdropUrl: backdrop('sports-day'),
  name: 'Sports day',
  year: 2024,
  kind: 'HOME_VIDEO',
  runtimeMinutes: 7,
  file: makeFileSpec({
    filename: 'VID_20241108_101500.mp4',
    directory: '/mnt/tower/ours/2024/',
    container: 'MP4',
    videoCodec: 'H.264',
    width: 1920,
    height: 1080,
    sizeBytes: 1.1 * GB,
    probed: true,
  }),
  plan: directPlay({ resolution: '1080p', bitrateMbps: 20.0 }),
  capturedAt: '2024-11-08',
  people: ['Kids'],
});

export const diwali: Title = makeTitle({
  id: 't-diwali',
  posterUrl: poster('diwali'),
  backdropUrl: backdrop('diwali'),
  name: 'Diwali',
  year: 2023,
  kind: 'HOME_VIDEO',
  runtimeMinutes: 12,
  file: makeFileSpec({
    filename: 'IMG_4471.mov',
    directory: '/mnt/tower/ours/2023/',
    container: 'MOV',
    videoCodec: 'H.264',
    width: 1920,
    height: 1080,
    sizeBytes: 2.4 * GB,
    probed: true,
  }),
  plan: directPlay({ resolution: '1080p', bitrateMbps: 22.0 }),
  capturedAt: '2023-10-21',
  place: 'Home',
});

export const films: Title[] = [
  nightfallDrive,
  copperSky,
  ironGarden,
  theLongReturn,
  neonFable,
  nightDrive,
];
export const anime: Title[] = [kiteSeason];
export const homeVideos: Title[] = [goaDayTwo, sportsDay, diwali];
export const all: Title[] = [...films, ...anime, ...homeVideos];

// --- Aggregates --------------------------------------------------------

export const librarySummary: LibrarySummary = {
  itemCount: 84,
  totalBytes: 1.9 * TB,
  categories: [
    { kind: 'FILM', itemCount: 52, totalBytes: 1.24 * TB },
    { kind: 'ANIME', itemCount: 14, totalBytes: 198 * GB },
    { kind: 'HOME_VIDEO', itemCount: 61, totalBytes: 361 * GB },
    { kind: 'MUSIC', itemCount: 9, totalBytes: 112 * GB },
  ],
  genres: ['Thriller', 'Drama', 'Anime', 'Adventure', 'Fantasy'],
};

export const timeline: Timeline = {
  grouping: 'DATE',
  groups: [
    { key: '2024-12', label: 'DEC / 2024', itemCount: 7, items: [goaDayTwo] },
    { key: '2024-11', label: 'NOV / 2024', itemCount: 3, items: [sportsDay] },
    { key: '2023-10', label: 'OCT / 2023', itemCount: 2, items: [diwali] },
  ],
  undatedCount: 9,
};

export const jumpTargets: JumpTarget[] = [
  { label: '/films', kind: 'FOLDER' },
  { label: '/ours/2024', kind: 'FOLDER' },
  { label: 'Meera', kind: 'PERSON' },
  { label: 'Kids', kind: 'PERSON' },
];

export const chapters: Chapter[] = [
  { index: 0, startSeconds: 0, endSeconds: 1400, title: 'Coast road' },
  { index: 6, startSeconds: 2690, endSeconds: 3960, title: 'The garage' },
  { index: 7, startSeconds: 3960, endSeconds: 5060, title: 'The bridge' },
  { index: 8, startSeconds: 5060, endSeconds: 7080, title: 'Last delivery' },
];

// --- Saved copies ------------------------------------------------------

export const savedItems: SavedItem[] = [
  { id: 's-1', title: nightfallDrive, state: Done, sizeBytes: 4.2 * GB },
  { id: 's-2', title: goaDayTwo, state: Done, sizeBytes: 3.2 * GB },
  {
    id: 's-3',
    title: copperSky,
    state: { type: 'CONVERTING', percent: 68, fromResolution: '4K', toResolution: '1080p' },
    sizeBytes: 8.1 * GB,
  },
];

export const savedSummary: SavedSummary = {
  itemCount: 3,
  usedBytes: 15.5 * GB,
  freeBytes: 41.2 * GB,
  segments: [
    { label: 'FILMS', bytes: 4.2 * GB, fraction: 0.31, kind: 'FILM' },
    { label: 'HOME VIDEO', bytes: 3.2 * GB, fraction: 0.24, kind: 'HOME_VIDEO' },
    { label: 'CONVERTING', bytes: 8.1 * GB, fraction: 0.18, kind: null },
  ],
};

// --- Cast --------------------------------------------------------------

export const castDevices: CastDevice[] = [
  {
    id: 'c-tv',
    name: 'Living room TV',
    plan: directPlay({ resolution: '2160p' }),
    maxResolution: '4K CAPABLE',
  },
  {
    id: 'c-stick',
    name: 'Bedroom stick',
    plan: transcode({
      fromResolution: '2160p',
      toResolution: '1080p',
      reasons: ['The stick tops out at 1080p.'],
    }),
    maxResolution: '1080p MAX',
  },
  {
    id: 'c-kitchen',
    name: 'Kitchen display',
    plan: directPlay({ resolution: '1080p' }),
    currentlyPlaying: 'Kite Season',
  },
];

// Watch together has no sample: a party is a live conversation between devices
// and a server, and a frozen one would show a member list that never changes and
// a clock that never moves — a screenshot pretending to be a feature. Guest mode
// sends people to sign in instead.
