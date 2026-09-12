import {
  AudioTrack,
  Chapter,
  Engagement,
  FileSpec,
  MediaKind,
  SubtitleTrack,
  Title,
  WatchState,
  makeFileSpec,
  makeTitle,
  prettyCodec,
  prettyContainer,
  PlaybackPlan,
  directPlay,
  transcode,
} from '@/domain/model/media';
import {
  ClientCapabilities,
  PlaybackSource,
  PlayerState,
  Trickplay,
} from '@/domain/model/player';
import { Category, LibrarySummary, Timeline, TimelineGrouping } from '@/domain/model/library';
import { AgeMode, Profile, makeProfile } from '@/domain/model/people';
import { Comment, CommentPage } from '@/domain/model/comment';
import { PartyMember, PartyRole, WatchParty } from '@/domain/model/watchParty';
import {
  AudioTrackDto,
  CategoryDto,
  ContinueWatchingDto,
  ItemDetailDto,
  ItemSummaryDto,
  LibrarySummaryDto,
  MediaInfoDto,
  ProfileDto,
  SubtitleTrackDto,
  TimelineDto,
  CommentDto,
  CommentPageDto,
  ChapterDto,
  ClientCapabilitiesRequestDto,
  PlaybackDecisionDto,
  PlayerStateDto,
  TrickplayDto,
  PartyDto,
} from '@/data/remote/dto';

// ---------------------------------------------------------------------------
// Wire → domain. One direction only: nothing in the app hands a domain object
// back to the transport except the few request builders at the bottom.
//
// Ported from data/remote/Mappers.kt.
// ---------------------------------------------------------------------------

export function toMediaKind(raw?: string | null): MediaKind {
  switch (raw?.toUpperCase()) {
    case 'FILM':
    case 'MOVIE':
      return 'FILM';
    case 'ANIME':
      return 'ANIME';
    case 'HOME_VIDEO':
    case 'OURS':
      return 'HOME_VIDEO';
    case 'MUSIC':
      return 'MUSIC';
    case 'PHOTO':
    case 'PHOTOS':
      return 'PHOTO';
    // An unknown type is still a file on the disk, and hiding it would be worse
    // than filing it under Films.
    default:
      return 'FILM';
  }
}

function watchStateOf(watched: boolean, resumeSeconds?: number | null): WatchState {
  if (watched) return 'WATCHED';
  if ((resumeSeconds ?? 0) > 0) return 'IN_PROGRESS';
  return 'UNWATCHED';
}

export function toFileSpec(
  info: MediaInfoDto | null | undefined,
  fileName: string,
  sizeBytes: number,
): FileSpec {
  return makeFileSpec({
    filename: fileName,
    container: info?.container ?? null,
    videoCodec: info?.videoCodec ?? null,
    width: info?.width ?? null,
    height: info?.height ?? null,
    sizeBytes,
    audioCodecs: info?.audioCodecs ?? null,
    audioChannels: info?.audioChannels ?? null,
    bitrateBitsPerSecond: info?.bitrate ?? null,
    probed: info?.probed ?? false,
  });
}

/**
 * Artwork lives behind the API, not on a CDN, so the URL is built from the
 * paired server's address. Null when the server has no artwork for the item —
 * the poster gradient is then the intended appearance rather than a broken
 * image.
 */
export function posterUrlFor(
  id: string,
  hasPoster: boolean,
  baseUrl?: string | null,
): string | null {
  return hasPoster && baseUrl ? `${baseUrl}/api/media/items/${id}/poster` : null;
}

/** Same rule for the wide art. Requesting it when absent would 404. */
export function backdropUrlFor(
  id: string,
  hasBackdrop: boolean,
  baseUrl?: string | null,
): string | null {
  return hasBackdrop && baseUrl ? `${baseUrl}/api/media/items/${id}/backdrop` : null;
}

/**
 * A grid tile.
 *
 * The summary endpoint deliberately carries no `mediaInfo`, so the only measured
 * facts available here are `quality` and the resume state. The file spec is left
 * mostly empty rather than invented — a poster that claims a codec it was never
 * told is worse than one that says nothing.
 */
export function summaryToTitle(dto: ItemSummaryDto, baseUrl?: string | null): Title {
  return makeTitle({
    id: dto.id,
    name: dto.title,
    year: dto.year ?? null,
    kind: toMediaKind(dto.type),
    runtimeMinutes: dto.runtimeMinutes ?? null,
    genres: dto.genres ?? [],
    rating: dto.rating ?? null,
    file: makeFileSpec({ filename: '', height: toHeightOrNull(dto.quality) }),
    watchState: watchStateOf(dto.watched ?? false, dto.resumePositionSeconds),
    positionSeconds: dto.resumePositionSeconds ?? 0,
    durationSeconds: dto.runtimeMinutes != null ? dto.runtimeMinutes * 60 : null,
    missing: dto.missing ?? false,
    posterUrl: posterUrlFor(dto.id, dto.hasPoster ?? false, baseUrl),
    backdropUrl: backdropUrlFor(dto.id, dto.hasBackdrop ?? false, baseUrl),
    capturedAt: dto.capturedAt ?? null,
  });
}

/** `1080p` / `4K` / `2160p` → a height the 4K filter can compare against. */
function toHeightOrNull(quality?: string | null): number | null {
  if (quality == null) return null;
  if (quality.toLowerCase() === '4k') return 2160;
  if (quality.toLowerCase().endsWith('p')) {
    const n = Number.parseInt(quality.slice(0, -1), 10);
    return Number.isNaN(n) ? null : n;
  }
  const n = Number.parseInt(quality, 10);
  return Number.isNaN(n) ? null : n;
}

export function detailToTitle(
  dto: ItemDetailDto,
  plan: Title['plan'],
  baseUrl?: string | null,
): Title {
  const audioTracks = dto.audioTracks ?? [];
  const file = toFileSpec(dto.mediaInfo, dto.fileName ?? '', dto.fileSize ?? 0);
  return makeTitle({
    id: dto.id,
    name: dto.title,
    year: dto.year ?? null,
    kind: toMediaKind(dto.type),
    runtimeMinutes: dto.runtimeMinutes ?? null,
    genres: dto.genres ?? [],
    rating: dto.rating ?? null,
    synopsis: dto.plot ?? null,
    tagline: dto.tagline ?? null,
    certification: dto.certification ?? null,
    studio: dto.studio ?? null,
    // Only when it says something the title does not. The server echoes the
    // title back here for anything it matched in English, and printing a name
    // twice under itself looks like a rendering fault.
    originalTitle:
      dto.originalTitle && dto.originalTitle.trim() !== '' && dto.originalTitle !== dto.title
        ? dto.originalTitle
        : null,
    imdbId: dto.imdbId ?? null,
    file: {
      ...file,
      audioLanguages: [
        ...new Set(
          audioTracks
            .map((t) => t.language?.toUpperCase())
            .filter((l): l is string => l != null && l !== ''),
        ),
      ],
    },
    watchState: watchStateOf(dto.watched ?? false, dto.resumePositionSeconds),
    positionSeconds: dto.resumePositionSeconds ?? 0,
    durationSeconds:
      dto.mediaInfo?.durationSeconds ??
      (dto.runtimeMinutes != null ? dto.runtimeMinutes * 60 : null),
    plan,
    subtitles: (dto.subtitles ?? []).map(subtitleToDomain),
    audioTracks: audioTracks.map(audioToDomain),
    posterUrl: posterUrlFor(dto.id, dto.hasPoster ?? false, baseUrl),
    backdropUrl: backdropUrlFor(dto.id, dto.hasBackdrop ?? false, baseUrl),
    capturedAt: dto.capturedAt ?? null,
    place: dto.place ?? null,
    people: dto.people ?? [],
    cast: toNameList(dto.castMembers),
    directors: toNameList(dto.directors),
    engagement: {
      views: dto.viewCount ?? 0,
      likes: dto.likeCount ?? 0,
      comments: dto.commentCount ?? 0,
      likedByMe: dto.liked ?? false,
    } satisfies Engagement,
  });
}

/**
 * `"Keanu Reeves, Carrie-Anne Moss"` → a list, in billing order.
 *
 * The server stores these as one string rather than a table, and splits on
 * commas or slashes depending on where the metadata came from. Blank entries are
 * dropped so a trailing separator does not become an empty name in the credits.
 */
function toNameList(raw?: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(/[,/;]/)
    .map((s) => s.trim())
    .filter((s) => s !== '');
}

export function subtitleToDomain(dto: SubtitleTrackDto): SubtitleTrack {
  return {
    index: dto.index,
    language: dto.language ?? 'Unknown',
    format: dto.format ?? null,
    embedded: dto.embedded ?? true,
    forced: dto.forced ?? false,
    hearingImpaired: dto.hearingImpaired ?? false,
  };
}

export function audioToDomain(dto: AudioTrackDto): AudioTrack {
  return {
    index: dto.index,
    codec: dto.codec ?? null,
    language: dto.language ?? null,
    title: dto.title ?? null,
  };
}

export function continueWatchingToTitle(
  dto: ContinueWatchingDto,
  baseUrl?: string | null,
): Title {
  const base = summaryToTitle(dto.item, baseUrl);
  return {
    ...base,
    positionSeconds: dto.positionSeconds,
    durationSeconds:
      dto.durationSeconds ??
      (dto.item.runtimeMinutes != null ? dto.item.runtimeMinutes * 60 : null),
    watchState: 'IN_PROGRESS',
  };
}

export function librarySummaryToDomain(dto: LibrarySummaryDto): LibrarySummary {
  return {
    itemCount: dto.itemCount ?? 0,
    totalBytes: dto.totalBytes ?? 0,
    categories: (dto.categories ?? []).map(
      (c: CategoryDto): Category => ({
        kind: toMediaKind(c.type),
        itemCount: c.itemCount ?? 0,
        totalBytes: c.totalBytes ?? 0,
      }),
    ),
    genres: dto.genres ?? [],
  };
}

export function timelineToDomain(dto: TimelineDto, baseUrl?: string | null): Timeline {
  let grouping: TimelineGrouping = 'DATE';
  if (dto.groupBy?.toLowerCase() === 'person') grouping = 'PERSON';
  else if (dto.groupBy?.toLowerCase() === 'place') grouping = 'PLACE';

  return {
    grouping,
    groups: (dto.groups ?? []).map((g) => ({
      key: g.key,
      label: g.label,
      itemCount: g.itemCount ?? 0,
      items: (g.items ?? []).map((i) => summaryToTitle(i, baseUrl)),
    })),
    undatedCount: dto.undatedCount ?? 0,
  };
}

/**
 * The server's `AgeMode` is `YOUNG` or `OLDER`, and defaults to `YOUNG` when a
 * profile is created without one — so an unrecognised value maps to `YOUNG`
 * rather than to the fuller layout. Erring toward the simpler, safer register is
 * the right direction when the value is in doubt.
 */
export function profileToDomain(dto: ProfileDto): Profile {
  const ageMode: AgeMode = dto.ageMode?.toUpperCase() === 'OLDER' ? 'OLDER' : 'YOUNG';
  return makeProfile({
    id: dto.id,
    name: dto.name,
    ageMode,
    avatarTint: dto.avatarTint ?? null,
    isOwner: dto.owner ?? false,
  });
}

/**
 * Cleans the raw tokens out of a server reason before a person reads it.
 *
 * The decision service builds sentences by interpolating ffprobe's own strings,
 * so "Container matroska,webm is not directly playable" reaches the plan card
 * verbatim — next to a spec row that correctly says `MKV`. The sentence is the
 * server's to write; the vocabulary is ours to make readable.
 */
export function humanisedReason(raw: string): string {
  let text = raw;

  const container = /Container ([\w,]+)/.exec(text);
  if (container) {
    const pretty = prettyContainer(container[1]);
    if (pretty) text = text.replace(`Container ${container[1]}`, `Container ${pretty}`);
  }

  const video = /Video codec (\w+)/.exec(text);
  if (video) {
    const pretty = prettyCodec(video[1]);
    if (pretty) text = text.replace(`Video codec ${video[1]}`, `Video codec ${pretty}`);
  }

  const audio = /Audio codec (\w+)/.exec(text);
  if (audio) {
    text = text.replace(`Audio codec ${audio[1]}`, `Audio codec ${audio[1].toUpperCase()}`);
  }

  return text;
}

export function commentToDomain(dto: CommentDto): Comment {
  return {
    id: dto.id,
    // A deleted profile falls back to the name it had; an absent one should not
    // render as a blank bubble.
    author: dto.authorName && dto.authorName.trim() !== '' ? dto.authorName : 'Someone',
    body: dto.body ?? '',
    postedAt: dto.createdAt ?? null,
    editedAt: dto.editedAt ?? null,
    mine: dto.mine ?? false,
    canDelete: dto.canDelete ?? false,
  };
}

export function commentPageToDomain(dto: CommentPageDto): CommentPage {
  return {
    comments: (dto.comments ?? []).map(commentToDomain),
    page: dto.page ?? 0,
    totalItems: dto.totalItems ?? 0,
    totalPages: dto.totalPages ?? 0,
  };
}

export function chapterToDomain(dto: ChapterDto): Chapter {
  return {
    index: dto.index,
    startSeconds: dto.startSeconds,
    endSeconds: dto.endSeconds ?? null,
    title: dto.title ?? null,
  };
}

export function trickplayToDomain(dto: TrickplayDto): Trickplay {
  const state = dto.state?.toUpperCase();
  return {
    state: state === 'READY' ? 'READY' : state === 'GENERATING' ? 'GENERATING' : 'FAILED',
    intervalSeconds: dto.intervalSeconds ?? 10,
    tileWidth: dto.tileWidth ?? 0,
    tileHeight: dto.tileHeight ?? 0,
    columns: dto.columns ?? 0,
    rows: dto.rows ?? 0,
    framesPerSheet: dto.framesPerSheet ?? 0,
    frameCount: dto.frameCount ?? 0,
    sheetCount: dto.sheetCount ?? 0,
    sheetUrlTemplate: dto.sheetUrlTemplate ?? '',
  };
}

export function playerStateToDomain(dto: PlayerStateDto): PlayerState {
  return {
    titleId: dto.mediaItemId,
    positionSeconds: dto.positionSeconds ?? 0,
    durationSeconds: dto.durationSeconds ?? null,
    watched: dto.watched ?? false,
    subtitleOffsetSeconds: dto.subtitleOffsetSeconds ?? 0,
    subtitleTrackIndex: dto.subtitleTrackIndex ?? null,
    audioTrackIndex: dto.audioTrackIndex ?? null,
    chapters: (dto.chapters ?? []).map(chapterToDomain),
    trickplay: dto.trickplay ? trickplayToDomain(dto.trickplay) : null,
  };
}

export function capabilitiesToDto(c: ClientCapabilities): ClientCapabilitiesRequestDto {
  return {
    deviceName: c.deviceName,
    videoCodecs: c.videoCodecs,
    audioCodecs: c.audioCodecs,
    containers: c.containers,
    maxHeight: c.maxHeight ?? null,
    maxBitrate: c.maxBitrate ?? null,
    supportsHls: c.supportsHls,
  };
}

/**
 * The decision, including the server's reasoning.
 *
 * The reasons are the sentences the plan card renders, so they are carried
 * across verbatim rather than being re-worded on the client — only cleaned of
 * ffprobe's raw tokens.
 */
export function decisionToSource(dto: PlaybackDecisionDto, absoluteUrl: string): PlaybackSource {
  const transcoding = dto.mode?.toUpperCase() === 'TRANSCODE';
  const height = dto.mediaInfo?.height;
  const reasons = (dto.reasons ?? []).map(humanisedReason);

  const plan: PlaybackPlan = transcoding
    ? transcode({
        fromResolution: height != null ? `${height}p` : null,
        toResolution: null,
        reasons,
      })
    : directPlay({
        resolution: height != null ? `${height}p` : null,
        bitrateMbps:
          dto.mediaInfo?.bitrate != null ? Math.round(dto.mediaInfo.bitrate / 100_000) / 10 : null,
        reasons,
      });

  return {
    url: absoluteUrl,
    sessionId: dto.sessionId ?? null,
    plan,
    startSeconds: dto.startSeconds ?? 0,
    headers: {},
  };
}

export function partyToDomain(dto: PartyDto): WatchParty {
  return {
    partyId: dto.partyId,
    code: dto.code,
    mediaItemId: dto.mediaItemId,
    itemTitle: dto.itemTitle ?? '',
    live: dto.live ?? false,
    maxMembers: dto.maxMembers ?? 0,
    youAreHost: dto.youAreHost ?? false,
    members: (dto.members ?? []).map(
      (m): PartyMember => ({
        id: m.id,
        name: m.name,
        role: (m.role?.toUpperCase() as PartyRole) ?? 'MEMBER',
        isHost: m.host ?? false,
        online: m.online ?? false,
        buffering: m.buffering ?? false,
        driftSeconds: m.driftSeconds ?? null,
      }),
    ),
    pending: dto.pending ?? [],
    clock: dto.clock
      ? {
          state: dto.clock.state?.toUpperCase() === 'PAUSED' ? 'PAUSED' : 'PLAYING',
          positionSeconds: dto.clock.positionSeconds ?? 0,
          atEpochMillis: dto.clock.atEpochMillis ?? 0,
          serverNowEpochMillis: dto.clock.serverNowEpochMillis ?? 0,
        }
      : null,
    capacityWarning: dto.capacityWarning ?? null,
  };
}
