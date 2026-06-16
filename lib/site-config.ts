export const siteConfig = {
  name: "rvroadlog",
  domain: "rvroadlog.com",
  shortTitle: "RVRoadLog",
  title: "RVRoadLog — Your Ultimate RV Travel Guide for Routes, Reviews & Camp Life",
  description: "Explore the best RV destinations, road trip routes, camper reviews, and camping tips. RVRoadLog helps you plan unforgettable adventures on the open road.",
  tagline: "Adventure Awaits on Every Mile",
  url: "https://rvroadlog.com",
  ogImage: "https://9bwbxubcyu3vbaiq.public.blob.vercel-storage.com/homepage/rvroadlog/hero-mGGI4MO1xdU0jjRYa5SCGs09Dy8b0Z.png",
  colors: {
    primary: "#2d6a4f",
    primaryDark: "#1b4332",
    secondary: "#40916c",
    accent: "#d4a373",
  },
  categories: [
    { key: "destinations", label: "Destinations", description: "Discover the best RV-friendly destinations across North America — national parks, coastal routes, and hidden gems." },
    { key: "rv-reviews", label: "RV Reviews", description: "Honest, detailed reviews of motorhomes, travel trailers, fifth wheels, and camper vans from top manufacturers." },
    { key: "road-trips", label: "Road Trips", description: "Curated road trip itineraries with campground stops, fuel planning, and scenic highlights for RV travelers." },
    { key: "camping-tips", label: "Camping Tips", description: "Expert tips on boondocking, hookups, RV maintenance, and making the most of your campsite experience." },
    { key: "rv-lifestyle", label: "RV Lifestyle", description: "Real stories and practical advice for full-time RV living, remote work on the road, and downsizing your life." },
    { key: "buying-guides", label: "Buying Guides", description: "Comprehensive buying guides to help you choose the right RV for your budget, travel style, and family size." },
  ] as { key: string; label: string; description: string }[],
};
