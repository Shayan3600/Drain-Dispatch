import type { Page } from "@playwright/test";
import { cityReviewFixtures, fixtureHistory } from "./city-fixtures";

export async function chooseCityFilter(page:Page,label:string,option:string) {
  await page.getByRole("combobox",{name:label,exact:true}).click();
  await page.getByRole("option",{name:option,exact:true}).click();
}
export async function mockCityApi(page:Page) {
  const items=structuredClone(cityReviewFixtures);
  const images=new Map<string,string>();
  for(const item of items)for(const observation of item.observations ?? []) {
    if(observation.photoUrl?.startsWith("data:image/svg+xml,")) {
      const url=`/uploads/test-${observation.id}.svg`;
      images.set(url,decodeURIComponent(observation.photoUrl.split(",").slice(1).join(",")));
      observation.photoUrl=url;
    }
  }
  await page.route("**/uploads/**",route=>route.fulfill({contentType:"image/svg+xml",body:images.get(new URL(route.request().url()).pathname) ?? ""}));
  await page.route("**/api/**",route=>{
    const url=new URL(route.request().url());
    if(url.pathname==="/api/incidents")return route.fulfill({json:items.map(item=>({...item,hasPhoto:item.observations?.some(observation=>Boolean(observation.photoUrl)),latestObservationAt:item.observations?.map(observation=>observation.createdAt).sort().at(-1)}))});
    const id=url.pathname.split("/")[3];
    const item=items.find(candidate=>candidate.id===id)!;
    return route.fulfill({json:url.pathname.endsWith("/history") ? fixtureHistory(item) : item});
  });
}
