export type FinishContext = {
    isNew: boolean
    hadMistakes: boolean
    clickedShowSolution: boolean
    wasRecurring: boolean
    intervalDays: number | null
    userChoice?: 'repeat_again' | 'next_opening'
    hadPriorFailToday?: boolean
}
const randInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min
export function scheduleNext(ctx: FinishContext) {
    const failed = ctx.hadMistakes || ctx.clickedShowSolution;

    // New
    if (ctx.isNew) {
        if (!failed) {
            const r = randInt(1, 4);
            return { status: 'review', intervalDays: r, todayOffset: r, decCounter: 'new' as const };
        }
        return { reinsertToday: true }; // new fail -> must repeat today
    }

    // Recurring
    if (!failed) {
        // SPECIAL CASE: there was a fail earlier today and user chose Next -> 2�3 days
        if (ctx.hadPriorFailToday && ctx.userChoice === 'next_opening') {
            const r = randInt(1, 2);
            return { status: 'review', intervalDays: r, todayOffset: r, decCounter: 'recurring' as const };
        }
        // normal recurring success -> double
        const next = Math.max(2, (ctx.intervalDays ?? 2) * 2);
        return { status: 'review', intervalDays: next, todayOffset: next, decCounter: 'recurring' as const };
    }

    // recurring fail -> must repeat today
    return { reinsertToday: true };
}
