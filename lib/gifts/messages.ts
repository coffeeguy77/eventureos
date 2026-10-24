/**
 * Ready-made personal messages for gift certificates — ten for each occasion, written separately for coffee gift cards
 * and barista-class gift certificates. Each fits the 200-character message on the back of the card. Pure.
 */

export type GiftKind = "coffee" | "lessons";
export type Occasion = "birthday" | "christmas" | "mothers" | "fathers" | "valentines" | "firstjob" | "justbecause" | "enthusiast";

export const OCCASIONS: { id: Occasion; label: string }[] = [
  { id: "birthday", label: "Birthday" },
  { id: "christmas", label: "Christmas" },
  { id: "mothers", label: "Mother's Day" },
  { id: "fathers", label: "Father's Day" },
  { id: "valentines", label: "Valentine's Day" },
  { id: "firstjob", label: "First job" },
  { id: "justbecause", label: "Just because" },
  { id: "enthusiast", label: "Coffee lover" },
];

export const GIFT_MESSAGES: Record<GiftKind, Record<Occasion, string[]>> = {
  coffee: {
    birthday: [
      "Another year older, another year bolder — just like your coffee. Happy birthday! This one's on me.",
      "Happy birthday! You're officially aged to perfection. Now go and find some beans that are too.",
      "They say don't count the years, so count the cups instead. Happy birthday — here's to many more of both.",
      "Happy birthday to someone who has never once been decaf. Stay strong. Stay rich. Stay you.",
      "Candles are overrated. Here's something you can actually grind. Happy birthday!",
      "Wishing you a birthday as full-bodied as your favourite roast — notes of joy, with a long and lovely finish.",
      "Happy birthday! I thought about getting you something you need. Then I remembered: coffee.",
      "You bring the warmth to every room, so consider this a refill. Happy birthday!",
      "Life's too short for bad coffee, and you're far too good for an ordinary birthday. Enjoy every bean.",
      "Happy birthday! May your cup be full, your mornings slow and your beans always freshly roasted.",
    ],
    christmas: [
      "Dear Santa, they've been very good this year (mostly after their first coffee). Merry Christmas!",
      "Merry Christmas! Forget chestnuts roasting on an open fire — these were roasted just for you.",
      "All I want for Christmas is more coffee. I had a feeling you'd say the same. Merry Christmas!",
      "May your days be merry and bright, and your coffee strong enough to get you through the relatives. Merry Christmas!",
      "Jingle bells, espresso smells… Wishing you a very merry, very well-caffeinated Christmas.",
      "Here's to slow Christmas mornings, the good mugs and coffee worth unwrapping. Merry Christmas!",
      "Santa runs on milk and cookies. You run on coffee. Merry Christmas — keep that engine running.",
      "Merry Christmas! Something lovely to brew while the pudding's on and the wrapping paper's everywhere.",
      "'Tis the season to be jolly — and just a little over-caffeinated. Merry Christmas!",
      "The best gifts are the ones you'll use every single day. Merry Christmas, and happy brewing.",
    ],
    mothers: [
      "Mum, you've run on coffee and love for years. Here's a top-up of the first one. Happy Mother's Day.",
      "For every early morning you were up before me — this time, the coffee's on me. Happy Mother's Day!",
      "Happy Mother's Day to the original barista. You always knew exactly what I needed.",
      "Mum, you're the perfect blend of strong and sweet. Happy Mother's Day!",
      "Put your feet up, brew something lovely and let someone else do the dishes. You've earned it. Happy Mother's Day!",
      "You gave me everything — including my coffee habit. Thanks, Mum. Happy Mother's Day.",
      "Happy Mother's Day! Wishing you a hot coffee, drunk while it's still hot. The ultimate luxury.",
      "To the woman who taught me to rise and shine: this should help with the rising. Happy Mother's Day.",
      "There's no one quite like you, Mum. These beans are a close second. Happy Mother's Day.",
      "Love you a latte, Mum. Happy Mother's Day.",
    ],
    fathers: [
      "Dad, you taught me to take life strong. Happy Father's Day — this one's on me.",
      "Happy Father's Day to the man whose dad jokes are even darker than his roast.",
      "Dad, you've never needed the instructions. You might need this coffee, though. Happy Father's Day!",
      "To the world's best dad — self-titled, mug-certified. Happy Father's Day!",
      "Happy Father's Day! Fuel for the shed, the footy and every 'quick job' that takes all day.",
      "Strong, reliable and always there in the morning. You and good coffee have a lot in common, Dad. Happy Father's Day.",
      "For all the early starts and the long drives — a coffee for every one of them. Happy Father's Day.",
      "Sorry for all the grounds for worry over the years, Dad. These ones are much better. Happy Father's Day!",
      "Dad, you're brew-tiful. That's the joke. You're welcome. Happy Father's Day!",
      "Thanks for the good advice and the terrible puns. Happy Father's Day — enjoy the brew.",
    ],
    valentines: [
      "You're the cream in my coffee, the foam on my flat white and my favourite reason to get up in the morning.",
      "I like you a latte. Actually, a lot more than a latte. Happy Valentine's Day.",
      "Roses are red, espresso is black, you've stolen my heart — and I'm not asking for it back. Happy Valentine's Day!",
      "We're the perfect blend. Happy Valentine's Day to my favourite person to share a pot with.",
      "You had me at 'Want a coffee?' Happy Valentine's Day.",
      "Our love is like good coffee: rich, warm and something I need every single day.",
      "Happy Valentine's Day to the one I'd share my last bean with. (Please don't test that.)",
      "I love you more than coffee. Please don't tell the coffee.",
      "You make my heart race faster than a double shot. Happy Valentine's Day.",
      "Every morning with you is my favourite cup. Happy Valentine's Day, love.",
    ],
    firstjob: [
      "Congratulations on the new job! Rule number one of working life: never skip the coffee.",
      "Your first job! Welcome to adulthood, where coffee isn't a drink — it's a strategy.",
      "So proud of you. Now go and show them what you're made of, fully caffeinated.",
      "New job, new routine, same golden rule: coffee first, emails second. Congratulations!",
      "The first pay cheque is on its way. Until then, the coffee's covered. Congratulations!",
      "You've got the job. Now you've got the coffee. Nothing can stop you. Congratulations!",
      "Every great career starts with a first day and a strong coffee. Here's to both — congratulations!",
      "Mondays will try their best. Coffee will try harder. Congratulations on the new job!",
      "Look at you, all grown up and employed! Here's something for the 3pm slump. Congratulations.",
      "Congratulations! May your inbox be light, your meetings short and your coffee strong.",
    ],
    justbecause: [
      "No reason. No occasion. Just you, deserving really good coffee.",
      "Saw this and thought of you — warm, a little bit strong and impossible to start the day without.",
      "Just a little something to say you make the everyday better. Enjoy a really good cup.",
      "Thinking of you, so I sent coffee. It's basically a hug you can drink.",
      "Because some days need a pick-me-up, and you deserve the good stuff.",
      "Just because you're you. (And because life's far too short for bad coffee.)",
      "A little reminder that someone's thinking of you — with every single sip.",
      "Why wait for a special occasion? Today is the occasion. Enjoy!",
      "You've been on my mind, and I'm guessing coffee's been on yours. Here's to both.",
      "A small surprise for a big-hearted person. Brew yourself something wonderful.",
    ],
    enthusiast: [
      "For the person who says 'tasting notes' with a straight face. Enjoy finding your next favourite.",
      "You don't just drink coffee — you appreciate it. Here's something worthy of your grinder.",
      "To my favourite coffee snob. Sorry — connoisseur. Happy brewing.",
      "Freshly roasted, carefully chosen and definitely not destined for a plunger left on the bench all day. Right?",
      "You've dialled in everything except your wish list. Consider it sorted.",
      "Life happens. Coffee helps. You already know that better than anyone.",
      "May your extraction be even, your crema golden and your beans never, ever stale.",
      "For the one who owns more brewing gadgets than mugs. Here's something to put through all of them.",
      "Single origin, double shot, triple the enjoyment. Happy brewing!",
      "You're the reason I know what a 'bloom' is. Here's to your next great cup.",
    ],
  },
  lessons: {
    birthday: [
      "Happy birthday! This year you're not just drinking the coffee — you're making it.",
      "Another year wiser, and soon one class more skilled. Happy birthday — go and learn to pour like a pro.",
      "Happy birthday! I can't make you any younger, but I can make you a barista.",
      "Blow out the candles, then learn to steam the milk. Happy birthday!",
      "Happy birthday! Your gift is a skill you'll use every morning for the rest of your life.",
      "Wishing you a birthday full of froth and fun. Latte art, here you come!",
      "Happy birthday! Learn the secrets of the perfect espresso — then make me one.",
      "It's your birthday, so here's a class where going back for another shot is encouraged.",
      "Happy birthday to a future latte artist. First the heart, then the world.",
      "Some people get socks. You get to become a barista. Happy birthday!",
    ],
    christmas: [
      "Merry Christmas! This year Santa's swapping elves for baristas — and you're joining the team.",
      "Unwrap a brand-new skill this Christmas: pouring the perfect flat white.",
      "Merry Christmas! Next year's Christmas-morning coffee is officially your job.",
      "May your Christmas be merry and your milk perfectly steamed. Enjoy your barista class!",
      "All I want for Christmas is a coffee made by you. So I got you lessons. Merry Christmas!",
      "Merry Christmas! A gift that can't be regifted, because the skill is all yours.",
      "Ho, ho, hold the jug like this… Merry Christmas, and enjoy learning the barista ropes.",
      "This Christmas, give that espresso machine a reason to shine. Merry Christmas and happy brewing!",
      "Learn to make café-quality coffee at home and you'll be everyone's favourite all year. Merry Christmas!",
      "Here's to joy, family and finally knowing what the steam wand is for. Merry Christmas!",
    ],
    mothers: [
      "Mum, you made my lunches for years. Now learn to make the perfect coffee — just for you. Happy Mother's Day.",
      "Happy Mother's Day! A morning that's all about you, and a skill that makes every morning better.",
      "Mum, you've mastered everything else. Barista is next. Happy Mother's Day!",
      "For the mum who deserves café coffee every day: now you can make it yourself. Happy Mother's Day.",
      "Happy Mother's Day! A little time out, a lot of coffee and a heart on top.",
      "Mum, you've always known how to stir things up. Now learn to stretch the milk. Happy Mother's Day!",
      "To the best mum in the world — and soon the best barista in the house. Happy Mother's Day.",
      "Happy Mother's Day! Swap the school run for a coffee run — you're in charge of the machine now.",
      "You've earned a morning just for you, Mum. Enjoy your class, and every coffee that follows.",
      "You pour love into everything, Mum. Now pour it into a latte. Happy Mother's Day.",
    ],
    fathers: [
      "Dad, you can fix anything. Now learn to fix a proper coffee. Happy Father's Day!",
      "Happy Father's Day! It's time the coffee machine got the respect the barbecue gets.",
      "Dad, you've got all the tools. Now get the skills. Happy Father's Day — enjoy your barista class.",
      "Happy Father's Day! Finally, a class where you're allowed to ask for directions.",
      "For the dad who actually reads the manual — this one comes with a teacher. Happy Father's Day.",
      "You've been boss of the barbie for years, Dad. Time to be boss of the beans. Happy Father's Day!",
      "Happy Father's Day! Learn to pull the perfect shot. Dad jokes optional, but expected.",
      "You taught me to do things properly, Dad. Now it's your turn to learn something new. Happy Father's Day.",
      "Your first latte art might look like a heart, or a cloud. Either way it's made with love. Happy Father's Day.",
      "Happy Father's Day! Soon we'll be coming to you for coffee as well as advice.",
    ],
    valentines: [
      "I love you a latte — so much that I want you to learn to make them. Happy Valentine's Day!",
      "Happy Valentine's Day! Learn to pour a heart, then pour one for me.",
      "You already make my heart melt. Now learn to make the milk do it too. Happy Valentine's Day.",
      "Roses fade and chocolates melt, but a barista skill lasts forever. Happy Valentine's Day, love.",
      "A date idea: you learn to make the coffee, I drink it. Forever. Happy Valentine's Day.",
      "You're my perfect match. Now let's perfect your milk. Happy Valentine's Day!",
      "Happy Valentine's Day! Every heart you pour from now on, I'll take as a love letter.",
      "I couldn't find a card that said how I feel, so here's a class that ends with a heart in a cup.",
      "You've always had a way of making things steamy. Now there's a wand for it. Happy Valentine's Day!",
      "Will you be my Valentine — and my personal barista? Enjoy your class, love.",
    ],
    firstjob: [
      "Congratulations on your first job! Here's a skill that'll make you everyone's favourite colleague.",
      "New job? Learn to make great coffee and you won't be the new kid for long. Congratulations!",
      "Congratulations! Every great career starts with a first day — and a seriously good coffee.",
      "You got the job! Now get the barista skills to help you survive it. So proud of you.",
      "Congrats on the new job! Behind a desk or behind a machine, this skill will come in handy.",
      "Congratulations! Learn to make coffee like a pro — it's the best networking tool there is.",
      "A first job deserves a first-class skill. Congratulations, and enjoy your barista class!",
      "Look at you, out in the world! Here's a skill to take with you wherever it leads. Congratulations.",
      "Congratulations! A great flat white opens nearly as many doors as a great résumé.",
      "Welcome to working life! Make the coffee great and everyone will remember your name.",
    ],
    justbecause: [
      "No reason — just a reminder that you deserve to learn something wonderful.",
      "Just because! Go and learn to make the coffee you love. (And maybe make me one too.)",
      "Because you've always wanted to try it, and now there's nothing stopping you.",
      "Thinking of you, and of the latte art you're about to master. Enjoy!",
      "A little something to make your mornings better — for the rest of your life.",
      "Just because you're brilliant. Now go and be brilliant at coffee too.",
      "Life's better with a new skill and a good coffee. Here's both.",
      "No occasion needed. Enjoy your barista class — you've more than earned it.",
      "You deserve a treat. This one comes with a jug, a machine and plenty of coffee.",
      "Here's to trying new things — and to the coffee you'll make afterwards.",
    ],
    enthusiast: [
      "You love coffee. Now it's time for coffee to love you back — made properly, by you.",
      "From coffee lover to coffee maker. Enjoy your barista class!",
      "You've ordered thousands of coffees. Time to find out how they're made.",
      "For the one who watches the barista more closely than the menu. Your turn behind the machine.",
      "Dial in your grind, master your milk and finally pour that rosetta. Enjoy!",
      "You already talk like a barista. Now you'll pour like one.",
      "Here's to even extraction, silky milk and your first proper tulip.",
      "Every great home barista starts somewhere. Yours starts here. Happy brewing!",
      "You're serious about coffee. So is this class.",
      "Behind every great cup is someone who learned how to make it. Now that's you.",
    ],
  },
};

// ---------- the occasion for today

/** yyyy-mm-dd → day number (UTC midnight), for date maths without time zones */
const day = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 864e5;
const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
/** The nth Sunday of a month (Australia: Mother's Day = 2nd Sunday in May, Father's Day = 1st Sunday in September) */
function nthSunday(y: number, month: number, n: number) {
  const first = new Date(Date.UTC(y, month - 1, 1)).getUTCDay();
  return iso(y, month, 1 + ((7 - first) % 7) + (n - 1) * 7);
}
export const mothersDay = (y: number) => nthSunday(y, 5, 2);
export const fathersDay = (y: number) => nthSunday(y, 9, 1);

/**
 * The best occasion for a date: Christmas from 1 to 25 December; Valentine's, Mother's and Father's Day from two weeks
 * out until the day itself; otherwise Birthday (the most common reason to give one).
 */
export function occasionFor(today: string): Occasion {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) return "birthday";
  const y = +today.slice(0, 4);
  const t = day(today);
  const within = (date: string) => t >= day(date) - 14 && t <= day(date);
  if (today >= iso(y, 12, 1) && today <= iso(y, 12, 25)) return "christmas";
  if (within(iso(y, 2, 14))) return "valentines";
  if (within(mothersDay(y))) return "mothers";
  if (within(fathersDay(y))) return "fathers";
  return "birthday";
}

/** The occasions in the order to show them: today's first, then the rest in their usual order. */
export function occasionsFor(today: string) {
  const now = occasionFor(today);
  return [...OCCASIONS.filter((o) => o.id === now), ...OCCASIONS.filter((o) => o.id !== now)];
}
