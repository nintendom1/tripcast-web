import React, { useEffect } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { ThemeProvider } from "../../providers/ThemeProvider";
import PhotoCompanionImportPanel from "./PhotoCompanionImportPanel";
import { StorybookConvexProvider, useConvexMock } from "../../stories/convex-mock";
import { tripcastApi } from "../../convex/tripcastApi";
import { BackgroundSaveProvider } from "../../providers/BackgroundSaveProvider";

const MockHydrator = ({
  children,
  mockOrphans = [],
}: {
  children: React.ReactNode;
  mockOrphans?: any[];
}) => {
  const { setQueryMock, setMutationMock } = useConvexMock();

  useEffect(() => {
    // Audit Orphan
    setQueryMock(tripcastApi.photoCompanion.travelerAuditOrphanPhotoPage, {
      page: mockOrphans,
      continueCursor: "",
      isDone: true,
    });

    // Mock mutations
    setMutationMock(tripcastApi.photoCompanion.travelerResolvePhotoCompanionRefs, [
      { pinRef: "checkin:pin-1", status: "ready" },
      { pinRef: "checkin:pin-2", status: "already_has_photo" },
      { pinRef: "checkin:pin-3", status: "unmatched" }
    ]);
    setMutationMock(tripcastApi.photoCompanion.travelerGeneratePhotoImportUploadUrls, ["http://example.com/upload-1"]);
    setMutationMock(tripcastApi.photoCompanion.travelerAttachPhotoCompanionBatch, [
      { pinRef: "checkin:pin-1", imageId: "img1", status: "attached" }
    ]);
    setMutationMock(tripcastApi.photoCompanion.travelerPruneOrphanPhotos, [
      { imageId: "img-orphan-1", status: "deleted" }
    ]);
  }, [setQueryMock, setMutationMock, mockOrphans]);

  return <>{children}</>;
};

const meta = {
  title: "Options/PhotoCompanionImportPanel",
  component: PhotoCompanionImportPanel,
  decorators: [
    (Story, context) => {
      const orphans = (context.args as any).mockOrphansList || [];
      return (
        <StorybookConvexProvider>
          <MockHydrator mockOrphans={orphans}>
            <BackgroundSaveProvider token="test">
              <ThemeProvider>
                <div className="w-[390px] border bg-[var(--bg-card)] p-4 rounded-xl mx-auto my-4">
                  <Story />
                </div>
              </ThemeProvider>
            </BackgroundSaveProvider>
          </MockHydrator>
        </StorybookConvexProvider>
      );
    },
  ],
  parameters: {
    layout: "centered",
  },
} satisfies Meta<typeof PhotoCompanionImportPanel>;

export default meta;

export const DefaultIdle: StoryObj<typeof meta> = {
  args: {
    token: "test-token"
  } as any,
};

export const OrphansScannedState: StoryObj<typeof meta> = {
  args: {
    token: "test-token",
    mockOrphansList: [
      { imageId: "img-orphan-1", bytes: 123456, contentType: "image/jpeg" },
      { imageId: "img-orphan-2", bytes: 987654, contentType: "image/png" }
    ]
  } as any,
  play: async ({ canvasElement }) => {
    // We can simulate clicking the "Scan" button in story play function to show scanned state
    const button = canvasElement.querySelector("button") as HTMLButtonElement;
    if (button && button.textContent?.includes("Scan")) {
      button.click();
    }
  }
};
