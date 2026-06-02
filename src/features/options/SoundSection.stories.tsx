import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";

import { SoundSection } from "./OptionsSheet";
import { MusicContext, type MusicContextValue } from "../../providers/MusicProvider";
import type { PatchSoundtrackId } from "../../lib/audio/patches";
import type { AudioSoundtrack } from "../../lib/audio/engine";

function makeMusic(overrides: Partial<MusicContextValue>): MusicContextValue {
  return {
    mute: false,
    setMute() {},
    volume: 0.3,
    setVolume() {},
    soundtrack: "auto",
    setSoundtrack() {},
    setScenario() {},
    setOverride() {},
    setSuppressed() {},
    nowPlaying: null,
    sfx() {},
    ...overrides,
  };
}

function MockMusic({
  value,
  children,
}: {
  value: Partial<MusicContextValue>;
  children: React.ReactNode;
}) {
  return <MusicContext.Provider value={makeMusic(value)}>{children}</MusicContext.Provider>;
}

const meta: Meta<typeof SoundSection> = {
  title: "Options/SoundSection",
  component: SoundSection,
  parameters: { layout: "centered" },
};

export default meta;
type Story = StoryObj<typeof SoundSection>;

function variant(value: Partial<MusicContextValue>): Story {
  return {
    render: () => (
      <MockMusic value={value}>
        <div className="w-[640px] max-w-full">
          <SoundSection />
        </div>
      </MockMusic>
    ),
  };
}

export const AutoDay = variant({
  soundtrack: "auto" satisfies AudioSoundtrack,
  nowPlaying: "song4_day" satisfies PatchSoundtrackId,
});

export const AutoNight = variant({
  soundtrack: "auto" satisfies AudioSoundtrack,
  nowPlaying: "song4_night" satisfies PatchSoundtrackId,
});

export const ManualStory = variant({
  soundtrack: "song7_story" satisfies AudioSoundtrack,
  nowPlaying: "song7_story" satisfies PatchSoundtrackId,
});

export const Muted = variant({
  mute: true,
  soundtrack: "song4_day" satisfies AudioSoundtrack,
  nowPlaying: "song4_day" satisfies PatchSoundtrackId,
});

export const OverrideOverManualDay = variant({
  soundtrack: "song4_day" satisfies AudioSoundtrack,
  nowPlaying: "song6_vote" satisfies PatchSoundtrackId,
});
