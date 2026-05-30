import type { Meta, StoryObj } from "@storybook/react";
import { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetBody, SheetFooter } from "./sheet";
import { Button } from "./button";

const meta = {
  title: "UI/Sheet",
  component: Sheet,
  tags: ["autodocs", "ai-generated"],
} satisfies Meta<typeof Sheet>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Sheet>
      <SheetTrigger>
        <Button variant="outline">Open Sheet</Button>
      </SheetTrigger>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>Edit Profile</SheetTitle>
          <SheetDescription>
            Make changes to your profile here. Click save when you're done.
          </SheetDescription>
        </SheetHeader>
        <SheetBody>
          <div className="py-4">
            <p>Profile form fields...</p>
          </div>
        </SheetBody>
        <SheetFooter>
          <Button type="submit">Save changes</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  ),
};

export const Bottom: Story = {
  render: () => (
    <Sheet>
      <SheetTrigger>
        <Button variant="outline">Open Bottom Sheet</Button>
      </SheetTrigger>
      <SheetContent side="bottom">
        <SheetHeader>
          <SheetTitle>Notifications</SheetTitle>
          <SheetDescription>Check your latest activity.</SheetDescription>
        </SheetHeader>
        <SheetBody>
          <div className="py-4 space-y-4">
            <p>Notification 1: You earned a badge!</p>
            <p>Notification 2: New route proposed.</p>
            <p>Notification 3: Travel funds updated.</p>
          </div>
        </SheetBody>
      </SheetContent>
    </Sheet>
  ),
};
