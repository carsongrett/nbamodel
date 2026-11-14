import { replaceHomeworkStories, requestHomeworkStories, rowsForStory } from "../../../lib/homework-story";
import { commitProjections, collectProjectionSources } from "../../../lib/sources/daily-run";
import { readJson, respond, slatePayload, todayOr } from "../../../lib/http";
import { updateDatabase } from "../../../lib/store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return respond(async () => {
    const body = await readJson(request);
    const date = todayOr(body.date);
    const collected = await collectProjectionSources(date, new Date().toISOString());
    return updateDatabase(async (db) => {
      const committed = commitProjections(db, date, collected);
      if (!committed.db) {
        return {
          result: {
            ...slatePayload(db, date),
            message: committed.message,
            messages: committed.messages,
          },
        };
      }
      const stories = await requestHomeworkStories(rowsForStory(committed.db, date), date, new Date().toISOString());
      const next = stories == null ? committed.db : replaceHomeworkStories(committed.db, date, stories);
      return {
        db: next,
        result: {
          ...slatePayload(next, date),
          message: committed.message,
          messages: committed.messages,
        },
      };
    });
  });
}
