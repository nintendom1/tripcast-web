# Photo Roulette

## Goal

Give the iPhone Traveler a photo-first check-in flow. Photo Roulette browses the
authorized Photos library newest-first in a horizontal, map-adjacent deck. The
map follows the photo while the Traveler swipes, and choosing a photo opens the
existing check-in draft with its image, capture time, and best location.

## Location rules

1. Use the photo asset's GPS coordinate when present.
2. Otherwise use the recorded Live Trail sample nearest to the capture time,
   with no maximum time gap. Always display the gap for a trail-derived match.
3. If neither source is available, let the Traveler place the photo manually
   with the existing map picker.

The map interpolates during horizontal dragging, throttled to approximately ten
updates per second, and settles on the active photo. Roulette keeps the entry
zoom clamped to levels 10–13.

## Photo and network rules

- Photo metadata and thumbnails stay on-device.
- The last-viewed Photos asset identifier is cached only on-device. Reopening
  keeps the prior in-memory deck visible while PhotoKit resolves the asset's
  current absolute index and loads one centered 24-photo window.
- PhotoKit filters the library before counting or paging. The oldest included
  date is the enabled saved Follower content cutoff, or otherwise the earliest
  Story pin. With neither available, Roulette uses the full authorized library.
- GPS-less capture times may be sent to Convex in bounded batches of at most 11
  to find nearest indexed trail samples.
- Browsing never uploads a photo or creates a server record.
- The selected image is exported locally as an upload-ready 1280 px JPEG and is
  uploaded only after the Traveler saves the check-in.
- Full iCloud assets require an explicit `Download & use` action with progress
  and cancellation. Map tiles continue to load directly from OpenFreeMap.

## UX

- Add a native-iPhone-only `Photo Roulette` item beside `Check In` in the
  Traveler Add menu. Hide it for Followers, web builds, and older native shells.
- Support full, limited, denied/restricted, and empty-library states. Limited
  access includes a `Manage Access` action.
- A compact rail shows three to four tappable thumbnails. The active photo's
  capture date and `Photo GPS`, `Trail match · <gap>`, or `Location unavailable`
  provenance appear in one shared row above the Dock.
- A newest-to-oldest timeline scrubber jumps to any library position without
  loading every intervening photo.
- Tapping a local photo opens the existing check-in form. An iCloud-only photo
  first opens a confirmation explaining potential cellular data use; browsing
  itself never enables network-backed PhotoKit requests.
- The draft uses the photo capture time, keeps all existing fields editable,
  and returns to the same Roulette card after cancel, save, or reopening.
- Saving queues the existing crash-safe background upload and allows multiple
  posts in one Roulette session.

## Compatibility

The backend adds only a Traveler-only nearest-trail query. There are no schema,
index, or checkpoint-source changes; Roulette check-ins reuse `fan_menu`.
Backend deployment precedes the iOS build, while existing web and iOS clients
remain compatible.

## Out of scope

Videos, album/search filters, batch posts, reverse geocoding, cross-session
duplicate detection, and new server-side photo-library records are excluded.
