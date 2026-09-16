import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Tasks",
    short_name: "Tasks",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#3b82f6",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
