import type { NextRequest } from 'next/server';
import { headers } from 'next/headers'

import { Redis } from '@upstash/redis';
import { Client } from "@upstash/qstash";
import BASE_URL from '@/app/utils/baseURL';

const client = new Client({ token: process.env.QSTASH_TOKEN as string });

const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL as string,
    token: process.env.UPSTASH_REDIS_REST_TOKEN as string,
});

export async function POST(req: NextRequest) {
    const data = await req.json();
    const scheduling = data.scheduling;
    const authHeader = headers().get('authorization') || headers().get('Authorization');

    await redis.json.set("mail:pipeline:settings", "$", data.scheduling);

    if (process.env.NODE_ENV === "production") {
        const queue = client.queue({
            queueName: "mail:queue"
        })
          
        await queue.upsert({
            parallelism: 5,
        })

        let cron;
        switch (scheduling.schedulingInterval) {
            case "minutes":
                cron = `*/${scheduling.schedulingNum} * * * *`;
                break;
            case "hours":
                cron = `0 */${scheduling.schedulingNum} * * *`;
                break;
        }
        if (!cron) {
            return Response.json({ status: 400, message: "Invalid cron" });
        }
        const schedules = client.schedules;
        const allSchedules = await schedules.list();
        for (let i = 0; i < allSchedules.length; i++) {
            if (allSchedules[i].destination === `${BASE_URL}/api/mail-pipeline/search-unseen`) {
                await schedules.delete(allSchedules[i].scheduleId);
            }
        }

        await schedules.create({
            destination: `${BASE_URL}/api/mail-pipeline/search-unseen`,
            headers: { "Authorization": authHeader as string},
            cron: cron,
            retries: 0,
        });
    }

    return Response.json({ status: 200, message: "Success" });
}

export const dynamic = "force-dynamic";