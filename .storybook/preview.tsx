import React, { useEffect } from "react";
import type { Preview, Decorator } from "@storybook/react-vite";
import { ThemeProvider, useTheme } from "../src/providers/ThemeProvider";
import { StorybookConvexProvider, useConvexMock } from "../src/stories/convex-mock";
import "../src/styles.css";
const ConvexMockWrapper = ({ children, convexMocks }: { children: React.ReactNode, convexMocks: any }) => {
  const { setQueryMock, setMutationMock } = useConvexMock();
  useEffect(() => {
    if (convexMocks?.queries) {
      if (Array.isArray(convexMocks.queries)) { convexMocks.queries.forEach(({ query, result }: any) => { setQueryMock(query, result); }); }
      else { Object.entries(convexMocks.queries).forEach(([query, result]) => { setQueryMock(query, result); }); }
    }
    if (convexMocks?.mutations) {
      if (Array.isArray(convexMocks.mutations)) { convexMocks.mutations.forEach(({ mutation, result }: any) => { setMutationMock(mutation, result); }); }
      else { Object.entries(convexMocks.mutations).forEach(([mutation, result]) => { setMutationMock(mutation, result); }); }
    }
  }, [convexMocks, setMutationMock, setQueryMock]);
  return <>{children}</>;
};
const withConvex: Decorator = (Story, context) => {
  const { convexMocks } = context.parameters;
  return ( <StorybookConvexProvider><ConvexMockWrapper convexMocks={convexMocks}><Story /></ConvexMockWrapper></StorybookConvexProvider> );
};
const ThemeWrapper = ({ theme, children }: { theme: any; children: React.ReactNode }) => {
  const { setMode } = useTheme();
  useEffect(() => { setMode(theme); }, [theme, setMode]);
  return <>{children}</>;
};
const withTheme: Decorator = (Story, context) => {
  const theme = context.globals.theme || "meadow";
  return ( <ThemeProvider><ThemeWrapper theme={theme}><div className="min-h-dvh bg-background text-foreground p-4"><Story /></div></ThemeWrapper></ThemeProvider> );
};
const preview: Preview = {
  parameters: {
    layout: "fullscreen",
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
    viewport: {
      viewports: { mobile: { name: "Mobile (iPhone-style)", styles: { width: "390px", height: "844px" } }, tablet: { name: "Tablet", styles: { width: "768px", height: "1024px" } } },
      defaultViewport: "mobile",
    },
  },
  globalTypes: {
    theme: {
      description: "Theme", defaultValue: "meadow",
      toolbar: { title: "Theme", icon: "circlehollow", items: [ { value: "meadow", icon: "sun", title: "Meadow" }, { value: "constellation", icon: "moon", title: "Constellation" } ], showName: true },
    },
  },
  decorators: [withTheme, withConvex],
};
export default preview;
