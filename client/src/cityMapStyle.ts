import type { Incident, IssueType } from "./types";

// Fixed hues for problem categories; increasing submission bands darken within each hue.
export const cityIssueColors: Record<IssueType, readonly string[]> = {
  blocked_drain: ["#f6bd79", "#eca149", "#d87b22", "#ad5c15", "#7c3e0e"],
  standing_water: ["#9ecaf4", "#69ade7", "#3889c7", "#246598", "#16416b"],
  damaged_drain: ["#f5a9a3", "#e77e73", "#d05248", "#a63730", "#76241f"],
  other: ["#ceb9f0", "#ae91dd", "#8868bd", "#63478f", "#422c65"],
};
export function colorLuminance(color: string) {
  const channels = [1,3,5].map(offset => parseInt(color.slice(offset,offset+2),16)/255)
    .map(value=>value<=0.04045 ? value/12.92 : ((value+0.055)/1.055)**2.4);
  return channels[0]*0.2126+channels[1]*0.7152+channels[2]*0.0722;
}
export function countForeground(color: string) {
  const luminance = colorLuminance(color);
  const dark = "#000000";
  return (luminance+0.05)/(colorLuminance(dark)+0.05) >= 1.05/(luminance+0.05) ? dark : "#ffffff";
}
export function cityMarkerStyle(incident: Pick<Incident,"issueType"|"observationCount">) {
  const count = Number.isFinite(incident.observationCount) ? Math.max(0,Math.floor(incident.observationCount)) : 0;
  const band = Math.min(5,Math.max(1,count));
  const color = (cityIssueColors[incident.issueType] ?? cityIssueColors.other)[band-1];
  return { count, band, color, foreground:countForeground(color) };
}
