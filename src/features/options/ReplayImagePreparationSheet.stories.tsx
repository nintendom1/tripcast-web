import type { Meta, StoryObj } from "@storybook/react-vite";
import { ReplayImagePreparationView } from "./ReplayImagePreparationSheet";
import { PhotoQualityView } from "./PhotoQualityControl";
const meta = {
  title: "Options/ReplayImagePreparationSheet", component: ReplayImagePreparationView,
  parameters: { layout: "fullscreen" },
  args: { open: true, onOpenChange: () => {}, onPreview: () => {}, onPrepare: () => {}, onStop: () => {},
    items: [{ source: "a", bytes: 2_000_000, status: "pending", previewBytes: 0 }, { source: "b", bytes: 1_000_000, status: "ready", previewBytes: 80_000 }],
    progress: { running: false, stopping: false, completed: 0, total: 0, error: null, source: null } },
} satisfies Meta<typeof ReplayImagePreparationView>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Pending: Story = {};
export const Running: Story = { args: { progress: { running: true, stopping: false, completed: 1, total: 2, error: null, source: "a" } } };
export const Stopping: Story = { args: { progress: { running: true, stopping: true, completed: 1, total: 2, error: null, source: "a" } } };
export const Failed: Story = { args: { items: [{ source: "a", bytes: 2_000_000, status: "failed", previewBytes: 0 }], progress: { running: false, stopping: false, completed: 1, total: 1, error: "Image conversion failed. Resume to retry.", source: null } } };
export const Ready: Story = { args: { items: [{ source: "a", bytes: 2_000_000, status: "ready", previewBytes: 80_000 }] } };

export const SmallerPhotos: Story = { args: { children: <PhotoQualityView original={false} onChange={() => {}} /> } };
export const OriginalPhotos: Story = { args: { children: <PhotoQualityView original onChange={() => {}} /> } };
export const SavingQuality: Story = { args: { children: <PhotoQualityView original busy onChange={() => {}} /> } };
export const QualitySaveFailed: Story = { args: { children: <PhotoQualityView original error="Connection interrupted." onChange={() => {}} /> } };
