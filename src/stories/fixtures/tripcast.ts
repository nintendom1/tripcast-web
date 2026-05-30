export const FAKE_STORIES = [
  {
    _id: "s1",
    title: "Mountain View",
    content: "We reached the summit after 4 hours of hiking. The view was absolutely breathtaking!",
    locationName: "Mt. Rainier",
    timestamp: Date.now() - 86400000,
    authorName: "Alice",
    photoUrl: "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&q=80&w=400",
  },
  {
    _id: "s2",
    title: "Local Delicacy",
    content: "Tried the famous street tacos today. Best $2 I've ever spent.",
    locationName: "Downtown Market",
    timestamp: Date.now() - 43200000,
    authorName: "Bob",
    photoUrl: null,
  },
];

export const FAKE_MISSIONS = [
  {
    _id: "m1",
    title: "The Golden Temple",
    description: "Visit the temple at sunrise and find the hidden inscription.",
    status: "active",
    type: "exploration",
    reward: "100 XP",
  },
  {
    _id: "m2",
    title: "Market Master",
    description: "Buy three different types of tropical fruit.",
    status: "completed",
    type: "collection",
    reward: "50 XP",
  },
];

export const FAKE_VOTES = {
  active: {
    _id: "v1",
    question: "Where should we go for dinner?",
    options: [
      { id: "opt1", label: "Sushi Bar", votes: 3 },
      { id: "opt2", label: "Italian Trattoria", votes: 5 },
      { id: "opt3", label: "Burger Joint", votes: 2 },
    ],
    totalVotes: 10,
    status: "open",
  },
};

export const FAKE_TRAVEL_FUNDS = {
  balance: 1250.50,
  currency: "USD",
  transactions: [
    { _id: "t1", description: "Hotel Booking", amount: -450.00, category: "Lodging", date: Date.now() - 172800000 },
    { _id: "t2", description: "ATM Withdrawal", amount: -100.00, category: "Cash", date: Date.now() - 86400000 },
    { _id: "t3", description: "Fuel", amount: -65.20, category: "Transport", date: Date.now() - 3600000 },
  ],
};

export const FAKE_VITALS = {
  health: 85,
  stamina: 60,
  status: "Exploring",
  level: 12,
  xp: 2450,
  xpNext: 3000,
};
