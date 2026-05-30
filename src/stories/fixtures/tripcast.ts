export const FAKE_STORIES = [
  { _id: "s1", title: "Mountain View", content: "Great hike!", locationName: "Mt. Rainier", timestamp: Date.now(), authorName: "Alice", photoUrl: null },
];

export const FAKE_STORY = {
  _id: "s1",
  checkpointId: "cp1",
  title: "A Night in the Desert",
  body: "The stars were incredible. We could see the Milky Way clearly.",
  occurredAt: Date.now() - 3600000 * 2,
  createdAt: Date.now() - 3600000 * 2,
  narrativeLevel: "narrative",
  locationLabel: "Joshua Tree",
  lat: 34.01,
  lon: -116.23,
  imageId: "img1",
};

export const FAKE_MISSIONS = [
  { _id: "m1", title: "The Temple", description: "Visit it.", status: "active", type: "exploration", reward: "100 XP" },
];

export const FAKE_MISSION = {
  _id: "m1",
  title: "Reach the Summit",
  description: "Climb to the top of the ridge for a view of the valley.",
  status: "in_progress",
  locationLabel: "Ridge Viewpoint",
  estimatedDurationMinutes: 45,
  estimatedCostUsd: 0,
  estimatedEnergyImpact: 20,
};

export const FAKE_VOTES = {
  active: { _id: "v1", question: "Dinner?", options: [{ id: "opt1", label: "Sushi", votes: 3 }], totalVotes: 3, status: "open" },
};
export const FAKE_TRAVEL_FUNDS = { balance: 1000, currency: "USD", transactions: [] };
export const FAKE_VITALS = { health: 85, stamina: 60, status: "Exploring" };
