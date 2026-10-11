/** User-supplied reference photos for the local demo. Original bytes/watermarks stay intact.
 * These are not verified Chapel Hill complaints or evidence of the seeded locations/dates.
 * User confirmed permission to publish all ten photos in this repository on 2026-10-11.
 * Original authorship/location/date and permissions for other uses are not independently verified.
 */
export const cityReferencePhotos = [
  { filename: "damaged-grate.png", category: "damaged_drain", description: "A rectangular grate with a broken bar." },
  { filename: "water-around-leafy-drain.png", category: "standing_water", description: "Water around a drain with leaves at its edge." },
  { filename: "leaves-and-growth-on-grate.png", category: "blocked_drain", description: "Leaves and plant growth cover parts of a grate." },
  { filename: "damaged-circular-drain-rim.png", category: "damaged_drain", description: "A circular drain with damaged surrounding pavement. Original iStock / Michael Vi watermark retained." },
  { filename: "broken-pavement-around-drain.png", category: "damaged_drain", description: "Broken pavement and exposed material around a drain; repair status unknown." },
  { filename: "branches-and-litter-on-grate.png", category: "blocked_drain", description: "Branches and litter cover parts of a curbside grate." },
  { filename: "runoff-around-circular-drain.png", category: "standing_water", description: "Water and leaves around a circular drain." },
  { filename: "autumn-leaves-at-curb-grate.png", category: "blocked_drain", description: "Autumn leaves cover a curbside grate." },
  { filename: "leaf-pile-at-curb.png", category: "blocked_drain", description: "A dense leaf pile at the curb. Original kare11.com watermark retained." },
  { filename: "red-leaves-on-grate.png", category: "blocked_drain", description: "Red and brown leaves cover parts of a rectangular grate." },
] as const;
