// ---------------------------------------------------------------------------
// Wire shapes, mirroring the server's records field for field.
//
// These are deliberately dumb and deliberately optional: the server declares
// most fields as boxed types, so anything not marked @NotNull there is optional
// here. Mapping to the domain model — where the defaults and the derived strings
// live — happens in mappers.ts and nowhere else.
//
// Ported from data/remote/dto/*.kt.
// ---------------------------------------------------------------------------

export interface UserDto {
  id?: string;
  username?: string;
  email?: string;
  displayName?: string;
  role?: string;
}

export interface AuthResponseDto {
  token: string;
  /**
   * Opaque, and the only copy there will ever be — the server keeps a SHA-256 of
   * it. Rotated on every refresh, so what comes back must replace what was sent.
   * Absent on a server older than the refresh endpoint.
   */
  refreshToken?: string | null;
  user?: UserDto | null;
}

/** `ProfileDto`. `ageMode` is YOUNG or OLDER. */
export interface ProfileDto {
  id: string;
  name: string;
  ageMode?: string | null;
  avatarTint?: string | null;
  owner?: boolean;
}

/** `CatalogDtos.ItemSummaryDto` — what a poster tile needs. */
export interface ItemSummaryDto {
  id: string;
  type: string;
  title: string;
  year?: number | null;
  runtimeMinutes?: number | null;
  rating?: number | null;
  quality?: string | null;
  genres?: string[];
  hasPoster?: boolean;
  hasBackdrop?: boolean;
  missing?: boolean;
  resumePositionSeconds?: number | null;
  watched?: boolean;
  percentComplete?: number | null;
  capturedAt?: string | null;
  artist?: string | null;
  album?: string | null;
}

/** `CatalogDtos.MediaInfoDto` — what ffprobe found inside the container. */
export interface MediaInfoDto {
  container?: string | null;
  durationSeconds?: number | null;
  videoCodec?: string | null;
  width?: number | null;
  height?: number | null;
  bitrate?: number | null;
  audioCodecs?: string | null;
  audioChannels?: number | null;
  probed?: boolean;
}

export interface SubtitleTrackDto {
  index: number;
  language?: string | null;
  format?: string | null;
  forced?: boolean;
  hearingImpaired?: boolean;
  embedded?: boolean;
}

export interface AudioTrackDto {
  index: number;
  codec?: string | null;
  language?: string | null;
  title?: string | null;
}

/** `CatalogDtos.ItemDetailDto` — fetched only when a title is opened. */
export interface ItemDetailDto {
  id: string;
  type: string;
  libraryName?: string | null;
  title: string;
  originalTitle?: string | null;
  year?: number | null;
  plot?: string | null;
  tagline?: string | null;
  runtimeMinutes?: number | null;
  rating?: number | null;
  certification?: string | null;
  genres?: string[];
  directors?: string | null;
  castMembers?: string | null;
  studio?: string | null;
  quality?: string | null;
  tmdbId?: string | null;
  imdbId?: string | null;
  capturedAt?: string | null;
  place?: string | null;
  people?: string[];
  fileSize?: number;
  fileName?: string;
  hasPoster?: boolean;
  hasBackdrop?: boolean;
  /**
   * Engagement, carried on the detail payload so the screen renders in one call
   * and only asks for the thread when it is opened. `liked` is for the profile
   * in `X-Profile-Id`, not the account.
   */
  viewCount?: number;
  likeCount?: number;
  commentCount?: number;
  liked?: boolean;
  mediaInfo?: MediaInfoDto | null;
  subtitles?: SubtitleTrackDto[];
  audioTracks?: AudioTrackDto[];
  resumePositionSeconds?: number | null;
  watched?: boolean;
}

export interface ItemPageDto {
  items?: ItemSummaryDto[];
  page?: number;
  size?: number;
  totalItems?: number;
  totalPages?: number;
}

export interface ContinueWatchingDto {
  item: ItemSummaryDto;
  positionSeconds: number;
  durationSeconds?: number | null;
}

export interface CategoryDto {
  type: string;
  label?: string;
  itemCount?: number;
  totalBytes?: number;
}

export interface LibrarySummaryDto {
  itemCount?: number;
  totalBytes?: number;
  categories?: CategoryDto[];
  genres?: string[];
}

export interface TimelineGroupDto {
  key: string;
  label: string;
  itemCount?: number;
  items?: ItemSummaryDto[];
}

export interface TimelineDto {
  groupBy?: string;
  groups?: TimelineGroupDto[];
  undatedCount?: number;
  page?: number;
  size?: number;
  totalItems?: number;
  totalPages?: number;
  hasMore?: boolean;
}

/**
 * `EngagementDtos.LikeDto` — the answer to liking or unliking.
 *
 * Carries the new count so the screen does not have to refetch the item just to
 * move a number by one.
 */
export interface LikeDto {
  mediaItemId: string;
  liked?: boolean;
  likeCount?: number;
}

/**
 * `EngagementDtos.CommentDto`.
 *
 * `mine` and `canDelete` are computed for the profile in `X-Profile-Id`, so the
 * client renders its own bubbles and hides a delete the server would refuse
 * rather than working either out for itself.
 */
export interface CommentDto {
  id: string;
  mediaItemId?: string | null;
  profileId?: string | null;
  authorName?: string | null;
  body?: string;
  createdAt?: string | null;
  /** Null while the comment stands as first posted. */
  editedAt?: string | null;
  mine?: boolean;
  canDelete?: boolean;
}

/** `EngagementDtos.CommentPageDto` — newest first. */
export interface CommentPageDto {
  comments?: CommentDto[];
  page?: number;
  size?: number;
  totalItems?: number;
  totalPages?: number;
}

/**
 * `PlaybackDtos.ClientCapabilitiesRequest`.
 *
 * Everything is nullable on the server and a null means "unknown", which biases
 * the decision toward transcoding rather than a stall on the device — so this is
 * one place where omitting a field is safe but lying about one is not.
 */
export interface ClientCapabilitiesRequestDto {
  deviceName?: string | null;
  videoCodecs?: string[];
  audioCodecs?: string[];
  containers?: string[];
  maxHeight?: number | null;
  maxBitrate?: number | null;
  supportsHls?: boolean | null;
}

/** `PlaybackDtos.PlaybackDecisionDto`. `mode` is DIRECT or TRANSCODE. */
export interface PlaybackDecisionDto {
  mediaItemId: string;
  mode: string;
  url: string;
  sessionId?: string | null;
  startSeconds?: number | null;
  mediaInfo?: MediaInfoDto | null;
  reasons?: string[];
}

export interface ChapterDto {
  index: number;
  startSeconds: number;
  endSeconds?: number | null;
  title?: string | null;
}

/** `PlayerDtos.TrickplayDto`. `state` is READY, GENERATING or FAILED. */
export interface TrickplayDto {
  state: string;
  intervalSeconds?: number;
  tileWidth?: number;
  tileHeight?: number;
  columns?: number;
  rows?: number;
  framesPerSheet?: number;
  frameCount?: number;
  sheetCount?: number;
  sheetUrlTemplate?: string;
  error?: string | null;
}

export interface PlayerStateDto {
  mediaItemId: string;
  positionSeconds?: number;
  durationSeconds?: number | null;
  watched?: boolean;
  subtitleOffsetSeconds?: number | null;
  subtitleTrackIndex?: number | null;
  audioTrackIndex?: number | null;
  chapters?: ChapterDto[];
  trickplay?: TrickplayDto | null;
}

/** `AnalyticsDtos.LoginEventDto` — one row of the sign-in log. */
export interface LoginEventDto {
  id: string;
  deviceId?: string | null;
  platform?: string | null;
  appVersion?: string | null;
  ip?: string | null;
  country?: string | null;
  region?: string | null;
  at?: string | null;
}

/** `WatchPartyDtos.ClockDto`. Both timestamps are the server's own. */
export interface PartyClockDto {
  state: string;
  positionSeconds: number;
  atEpochMillis: number;
  serverNowEpochMillis: number;
}

/** `WatchPartyDtos.MemberDto`. */
export interface PartyMemberDto {
  id: string;
  name: string;
  role?: string;
  host?: boolean;
  joinedAt?: string | null;
  online?: boolean;
  buffering?: boolean;
  driftSeconds?: number | null;
}

/** `WatchPartyDtos.PartyDto` — the whole party as one device sees it. */
export interface PartyDto {
  partyId: string;
  code: string;
  mediaItemId: string;
  itemTitle?: string;
  live?: boolean;
  maxMembers?: number;
  youAreHost?: boolean;
  members?: PartyMemberDto[];
  pending?: { requestId: string; name: string }[];
  clock?: PartyClockDto | null;
  capacityWarning?: string | null;
}

/** `MediaSettingsDto` — the per-profile settings the server holds. */
export interface MediaSettingsDto {
  profileId?: string | null;
  awayBehaviour?: string | null;
  downloadHeight?: number | null;
  awayMaxHeight?: number | null;
  showTechnicalBadges?: boolean;
  preferredLanguage?: string | null;
  preferredGenres?: string[];
}
