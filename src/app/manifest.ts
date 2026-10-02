import type { MetadataRoute } from "next";

// Lets "Add to Home Screen" open the dashboard full screen, like an app.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "InfuseHER Today",
    short_name: "InfuseHER",
    start_url: "/",
    display: "standalone",
    background_color: "#f8f3ec",
    theme_color: "#f8f3ec",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
