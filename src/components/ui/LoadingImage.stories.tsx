import type { Meta, StoryObj } from "@storybook/react-vite";
import { LoadingImage } from "./LoadingImage";

const meta = {
  title: "UI/LoadingImage",
  component: LoadingImage,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof LoadingImage>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    src: "https://picsum.photos/seed/tripcast/800/600",
    alt: "A beautiful scenery",
    containerClassName: "w-80 rounded-lg shadow-md",
  },
};

export const SlowLoading: Story = {
  args: {
    // Adding a random query param to bypass cache and potentially slow it down
    src: `https://picsum.photos/seed/slow/800/600?t=${Date.now()}`,
    alt: "Slow loading image",
    containerClassName: "w-80 rounded-lg shadow-md",
  },
};

export const Square: Story = {
  args: {
    src: "https://picsum.photos/seed/square/600/600",
    alt: "Square image",
    aspectRatio: "1/1",
    containerClassName: "w-64 rounded-lg shadow-md",
  },
};

export const SixteenNine: Story = {
  args: {
    src: "https://picsum.photos/seed/wide/1600/900",
    alt: "Wide image",
    aspectRatio: "16/9",
    containerClassName: "w-96 rounded-lg shadow-md",
  },
};

export const Error: Story = {
  args: {
    src: "https://invalid-image-url.com/not-found.jpg",
    alt: "Error state",
    containerClassName: "w-80 rounded-lg shadow-md",
  },
};
