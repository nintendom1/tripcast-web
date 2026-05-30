import React, { useEffect } from "react";
import type { Preview, Decorator } from "@storybook/react";
import { ThemeProvider, useTheme } from "../src/providers/ThemeProvider";
import "../src/styles.css";

const ThemeWrapper = ({ theme, children }: { theme: any; children: React.ReactNode }) => {
  const { setMode } = useTheme();

  useEffect(() => {
    setMode(theme);
  }, [theme, setMode]);

  return <>{children}</>;
};

const withTheme: Decorator = (Story, context) => {
  const theme = context.globals.theme || "meadow";
  return (
    <ThemeProvider>
      <ThemeWrapper theme={theme}>
        <div className="min-h-dvh bg-background text-foreground p-4">
          <Story />
        </div>
      </ThemeWrapper>
    </ThemeProvider>
  );
};

const preview: Preview = {
  parameters: {
    layout: 'fullscreen',
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    viewport: {
      viewports: {
        mobile: {
          name: "Mobile (iPhone-style)",
          styles: {
            width: "390px",
            height: "844px",
          },
        },
        tablet: {
          name: "Tablet",
          styles: {
            width: "768px",
            height: "1024px",
          },
        },
      },
      defaultViewport: "mobile",
    },
  },
  globalTypes: {
    theme: {
      description: "Global theme for components",
      defaultValue: "meadow",
      toolbar: {
        title: "Theme",
        icon: "circlehollow",
        items: [
          { value: "meadow", icon: "sun", title: "Meadow" },
          { value: "constellation", icon: "moon", title: "Constellation" },
        ],
        showName: true,
      },
    },
  },
  decorators: [withTheme],
};

export default preview;
