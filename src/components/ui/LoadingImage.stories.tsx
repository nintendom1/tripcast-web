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

/**
 * Deterministic loading state using the status prop override.
 */
export const Loading: Story = {
  args: {
    status: "loading",
    alt: "Loading state",
    containerClassName: "w-80 rounded-lg shadow-md",
  },
};

export const DynamicAspectRatio: Story = {
  args: {
    src: "https://picsum.photos/seed/portrait/600/800",
    alt: "Portrait image",
    imageWidth: 600,
    imageHeight: 800,
    containerClassName: "w-64 rounded-lg shadow-md",
    className: "object-cover"
  },
};

export const Square: Story = {
  args: {
    src: "https://picsum.photos/seed/square/600/600",
    alt: "Square image",
    aspectRatio: "1/1",
    containerClassName: "w-64 rounded-lg shadow-md",
    className: "object-cover"
  },
};

export const SixteenNine: Story = {
  args: {
    src: "https://picsum.photos/seed/wide/1600/900",
    alt: "Wide image",
    aspectRatio: "16/9",
    containerClassName: "w-96 rounded-lg shadow-md",
    className: "object-cover"
  },
};

export const Error: Story = {
  args: {
    src: "https://invalid-image-url.com/not-found.jpg",
    alt: "Error state",
    containerClassName: "w-80 rounded-lg shadow-md",
  },
};
