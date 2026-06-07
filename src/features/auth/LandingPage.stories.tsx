import type { Meta, StoryObj } from "@storybook/react-vite";

import LandingPage from "./LandingPage";

const meta = {
  title: "Auth/LandingPage",
  component: LandingPage,
  parameters: { layout: "fullscreen" },
  args: {
    onLoginClick: () => console.log("login"),
  },
} satisfies Meta<typeof LandingPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const LandingPageDefault: Story = {
  render: (args) => (
    <div className="-m-4">
      <LandingPage {...args} />
    </div>
  ),
};
