import TripMap from "./features/map/TripMap";

type AppProps = {
  convexReady: boolean;
};

export default function App({ convexReady }: AppProps) {
  return (
    <main className="app-shell">
      <header className="app-header">
        <h1>TripCast Map Test</h1>
      </header>
      <TripMap convexReady={convexReady} />
    </main>
  );
}
