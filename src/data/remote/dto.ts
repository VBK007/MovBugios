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
  trackNumber?: number | null;
  language?: string | null;
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
  artist?: string | null;
  album?: string | null;
  trackNumber?: number | null;
  language?: string | null;
}

export interface ItemPageDto {
  items?: ItemSummaryDto[];
  page?: number;
  size?: number;
  totalItems?: number;
  totalPages?: number;
}

/**
 * `CatalogDtos.PublicItemSummaryDto` — the same tile, minus every field that
 * only means something for a signed-in profile (resume position, watched,
 * liked).
 *
 * A separate shape rather than a reuse of `ItemSummaryDto` with everything
 * optional: what is missing here is the point. A guest tile that could carry a
 * resume position would eventually be given one by a mapper that stopped
 * distinguishing them, and that would be a claim about somebody who has no
 * profile to have watched anything with.
 */
export interface PublicItemSummaryDto {
  id: string;
  type: string;
  title: string;
  year?: number | null;
  runtimeMinutes?: number | null;
  rating?: number | null;
  genres?: string[];
  hasPoster?: boolean;
  hasBackdrop?: boolean;
  artist?: string | null;
  album?: string | null;
  language?: string | null;
}

export interface PublicItemPageDto {
  items?: PublicItemSummaryDto[];
  page?: number;
  size?: number;
  totalItems?: number;
  totalPages?: number;
}

/** `CatalogDtos.PublicItemDetailDto` — the title-opened view for a visitor. */
export interface PublicItemDetailDto {
  id: string;
  type: string;
  title: string;
  originalTitle?: string | null;
  year?: number | null;
  plot?: string | null;
  tagline?: string | null;
  runtimeMinutes?: number | null;
  rating?: number | null;
  certification?: string | null;
  genres?: string[];
  language?: string | null;
  directors?: string | null;
  castMembers?: string | null;
  studio?: string | null;
  quality?: string | null;
  imdbId?: string | null;
  artist?: string | null;
  album?: string | null;
  trackNumber?: number | null;
  hasPoster?: boolean;
  hasBackdrop?: boolean;
  mediaInfo?: MediaInfoDto | null;
  subtitles?: SubtitleTrackDto[];
  audioTracks?: AudioTrackDto[];
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

/** `CatalogDtos.LanguageDto` — one language the library holds. */
export interface LanguageDto {
  code: string;
  /** Already in English; the server owns the ISO table so clients need not. */
  name?: string | null;
}

/**
 * `CollectionDtos.CollectionDto` — a saved search with a name on it.
 *
 * `query` is deliberately absent. The server sends it so a client can show a
 * collection as removable chips or copy it into a new one, and that is worth
 * having — but this build only *reads* collections, and a field parsed into a
 * type nothing uses is a schema to keep in step for no benefit.
 */
export interface CollectionDto {
  id: string;
  /** `BUILTIN`, `CUSTOM` or `DISCOVERED`. Unknown values are ignored, not fatal. */
  kind?: string | null;
  name?: string | null;
  icon?: string | null;
  pinned?: boolean;
  /** Matches right now — a collection is a live query, so this moves. */
  itemCount?: number;
}

/** Split by kind server-side, so the screen renders three sections without grouping. */
export interface CollectionListDto {
  builtin?: CollectionDto[];
  custom?: CollectionDto[];
  discovered?: CollectionDto[];
}

/**
 * `RecommendationDtos.RecommendationDto` — one pick, with its reasoning.
 *
 * The three component scores are carried because the server computes them and
 * they are what a "why this?" explanation would be built from. Nothing shows
 * them yet; `reason` is the sentence a poster subtitle wants.
 */
export interface RecommendationDto {
  item: ItemSummaryDto;
  score?: number;
  /** `Because you watched Kaithi`, or absent when there is no evidence to name. */
  reason?: string | null;
  taste?: number;
  quality?: number;
  freshness?: number;
}

export interface RecommendationsDto {
  items?: RecommendationDto[];
  /**
   * What the server believes this profile likes.
   *
   * Returned so somebody can see where it is wrong. Not read yet — the rail
   * shows picks, and a taste profile is a screen of its own.
   */
  taste?: TasteFacetDto[];
  /** How many watched titles the taste was built from. */
  basedOn?: number;
  /** True when there is no history at all: quality and freshness only. */
  coldStart?: boolean;
}

export interface TasteFacetDto {
  kind?: string | null;
  value?: string | null;
  weight?: number;
  evidence?: string | null;
}

/**
 * One thing the server read out of a search phrase.
 *
 * `matched` is the words it was consumed from, so a chip can say what it came
 * from rather than only what it became.
 */
export interface SearchTermDto {
  field?: string | null;
  value?: string | null;
  label?: string | null;
  matched?: string | null;
}

/**
 * `SearchDtos.SearchResultDto`.
 *
 * `query_text` is snake_case on the wire — the one field in this API that is,
 * so it is named explicitly rather than left to a global naming convention that
 * would then have to be right about every other field too.
 */
export interface SearchResultDto {
  query_text?: string | null;
  terms?: SearchTermDto[];
  /** True when no rule matched. Says nothing about what happened next — see `interpretedBy`. */
  understoodNothing?: boolean;
  /**
   * `rules` or `model`.
   *
   * Only the rules parser reads a sentence span by span, so only it can say
   * which words became which filter. When a model took over, the server sends
   * no `terms` at all — and `understoodNothing` is still true, because it
   * records what the *rules* made of the phrase. Read together or the client
   * will tell somebody their sentence was ignored when it was in fact
   * understood by something else.
   */
  interpretedBy?: string | null;
  results?: ItemPageDto | null;
}

export interface AssistantAvailabilityDto {
  available?: boolean;
}

export interface AssistantRequestDto {
  question: string;
}

/**
 * One lookup the assistant made on the way to its answer.
 *
 * `arguments` stays as raw JSON. The server types it `Map<String, Object>` —
 * the values are whatever filter the model chose, so numbers, strings and
 * booleans all appear — and the client only ever prints them. Parsing them into
 * a union would be a schema to maintain in step with a tool surface that belongs
 * to the server, for no gain over reading them out as text.
 */
export interface ToolCallDto {
  tool?: string | null;
  arguments?: Record<string, unknown>;
  /** The tool errored. The assistant was told and may have recovered, so not fatal. */
  failed?: boolean;
}

/**
 * `AssistantDtos.AssistantAnswerDto`.
 *
 * `toolCalls` is the point as much as `answer` is. An assistant that will not
 * say what it looked at is one nobody can check.
 */
export interface AssistantAnswerDto {
  answer?: string | null;
  toolCalls?: ToolCallDto[];
  /**
   * False when it gave up, was switched off, or could not be reached. The text
   * is still worth showing either way — this only decides whether to offer a
   * retry.
   */
  answered?: boolean;
}

// ---------------------------------------------------------------------------
// `TeaserClipDtos` — short vertical clips cut from a film's own file.
//
// An admin picks the moment and the crop; the server encodes it with ffmpeg as
// a background job. This client only ever reads published, finished ones, so
// most of the admin-facing shape below is parsed and ignored — it is here
// because `state` and `error` are what explain a clip that has no file yet.
// ---------------------------------------------------------------------------

export interface TeaserClipDto {
  id: string;
  mediaItemId?: string | null;
  /** The film it was cut from, so the feed can name it without a second call. */
  itemTitle?: string | null;
  /** `QUEUED`, `GENERATING`, `READY` or `FAILED`. */
  state?: string | null;
  startSeconds?: number;
  endSeconds?: number;
  durationSeconds?: number;
  horizontalOffset?: number;
  /** What the cut is of — "the chase", "the reveal". Optional and often absent. */
  label?: string | null;
  published?: boolean;
  /** Server-relative, and null until the clip is READY. No file, nothing to play. */
  fileUrl?: string | null;
  width?: number | null;
  height?: number | null;
  bytes?: number | null;
  error?: string | null;
  createdAt?: string | null;
}

/**
 * `CastPhotoDtos.CastMemberDto` — a billed name, and a face where one was found.
 *
 * `photoUrl` is server-relative and null until the server has fetched and cached
 * one. Null is the ordinary case, not a failure: nothing in the catalogue gives a
 * cast member an identity beyond their name in a comma-separated string, so the
 * photo is looked up by a slug of that name and may simply not resolve.
 */
export interface CastMemberDto {
  name?: string | null;
  photoUrl?: string | null;
}

export interface TeaserFeedPageDto {
  items?: TeaserClipDto[];
  /**
   * The shuffle this page was dealt from.
   *
   * Hand it back on every later page of the same scroll — without it the server
   * deals page two from a fresh shuffle, which repeats clips already seen and
   * skips others entirely.
   *
   * Defaulted for an older server that sends none: zero means "did not say", and
   * the client then simply does not pass one back.
   */
  seed?: number;
  page?: number;
  size?: number;
  totalItems?: number;
  totalPages?: number;
}

// ---------------------------------------------------------------------------
// The music tab's own home screen.
//
// Browse-by-facet rather than the film home's popularity blend: a few hundred
// songs on a disk have no meaningful play-count ranking, so what this offers is
// ways *in* to a collection rather than a judgement about which track is best.
// ---------------------------------------------------------------------------

/** `HomeDtos.HomeItemDto` — a tile, with the reasoning a ranked rail would carry. */
export interface HomeItemDto {
  item: ItemSummaryDto;
  score?: number | null;
  reason?: string | null;
}

/**
 * `HomeDtos.HomeRailDto` — one horizontal row.
 *
 * `key` is stable and structured: `mood:calm`, `era:1990`, `director:Ilaiyaraaja`.
 * Worth keeping rather than flattening to the title, because it is what a row is
 * keyed on and what opening the shelf is built from.
 */
export interface HomeRailDto {
  key?: string | null;
  title?: string | null;
  items?: HomeItemDto[];
}

export interface MusicHomeDto {
  continueListening?: ItemSummaryDto[];
  rails?: HomeRailDto[];
}
