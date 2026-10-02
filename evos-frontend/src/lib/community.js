export const COMMUNITY_URL = "https://chat.whatsapp.com/CYSA7PRIlK0JklgVtQfhnR";
export const SUPPORT_URL = "https://wa.me/233208718943";
// Fire this from anywhere to open the community popup: openCommunity()
export const openCommunity = () => window.dispatchEvent(new CustomEvent("evos:community"));
