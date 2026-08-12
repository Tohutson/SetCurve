export type Track = {
  id: string;
  uri: string;
  name: string;
  artistNames: string[];
  durationMs: number;
  imageUrl?: string;
  spotifyUrl?: string;
  originalIndex: number;
};

export type TrackMetric = {
  trackId: string;
  value: number;
};

export type TrackWithMetric = Track & {
  metric: number;
};

export type CurvePoint = {
  x: number;
  y: number;
};

export type PlaylistSummary = {
  id: string;
  name: string;
  ownerName: string;
  imageUrl?: string;
  spotifyUrl?: string;
  trackCount: number;
};

export type UserProfile = {
  displayName: string;
  imageUrl?: string;
};

export type CreatedPlaylist = {
  id: string;
  name: string;
  spotifyUrl?: string;
};
