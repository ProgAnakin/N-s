/**
 * Every user-facing string in the app.
 *
 * This is a plain typed object rather than a translation library: a locale is
 * a module that satisfies `Strings`, so adding Portuguese, Italian or Chinese
 * later is a file, not a refactor, and TypeScript will list anything missing.
 *
 * Plurals and interpolation are functions. That keeps grammar with the
 * language rather than in the components — which matters most for the
 * languages this couple actually speaks.
 */

export const en = {
  app: {
    name: 'Nós',
    meaning: '“Nós” is Portuguese for “us” — and for the knot that ties two things together.',
  },

  common: {
    save: 'Save',
    saving: 'Saving…',
    cancel: 'Cancel',
    delete: 'Delete',
    edit: 'Edit',
    add: 'Add',
    close: 'Close',
    back: 'Back',
    search: 'Search',
    loading: 'One moment…',
    done: 'Done',
    all: 'All',
    optional: 'optional',
    more: 'More',
    less: 'Less',
    today: 'Today',
    shared: 'Shared',
    private: 'Private',
    sharedHint: 'Both of you can see and edit this.',
    privateHint: 'Only you can see this. Not even your partner.',
    confirmDelete: 'Delete this?',
    confirmDeleteBody: 'This cannot be undone.',
    noResults: 'Nothing matched that.',
    noResultsHint: 'Try a shorter word.',
  },

  nav: {
    home: 'Home',
    vault: 'About her',
    vaultOf: (name: string) => `About ${name}`,
    dates: 'Dates',
    memories: 'Memories',
    family: 'Family',
    phrasebook: 'Phrasebook',
    culture: 'Culture',
    trips: 'Trips',
    spending: 'Spending',
    gifts: 'Gift radar',
    distance: 'Distance',
    calendar: 'Calendar',
    together: 'Together',
    letters: 'Letters',
    settings: 'Settings',
    more: 'More',
    sections: {
      now: 'Now',
      her: 'Her',
      us: 'Us',
      practical: 'Practical',
    },
    skipToContent: 'Skip to content',
  },

  auth: {
    signInTitle: 'Come back in',
    signUpTitle: 'Make a space for two',
    signInSubtitle: 'Everything you’ve kept is where you left it.',
    signUpSubtitle: 'One space, two people, nobody else.',
    email: 'Email',
    password: 'Password',
    passwordHint: 'At least 8 characters.',
    displayName: 'Your name',
    signIn: 'Sign in',
    signUp: 'Create account',
    signOut: 'Sign out',
    toSignUp: 'No account yet? Create one.',
    toSignIn: 'Already have an account? Sign in.',
    checkEmail: 'Check your email to confirm your address, then sign in.',
    signingIn: 'Signing in…',
    creating: 'Creating your account…',
  },

  onboarding: {
    welcomeTitle: 'Welcome',
    welcomeBody:
      'This is a private space for the two of you. Memories, the dates that matter, what you’re learning about each other, and a fair, quiet view of what you spend.',
    privacyTitle: 'Two kinds of notes',
    privacySharedTitle: 'Shared',
    privacySharedBody:
      'Memories, dates, trips, the phrasebook, family, culture. Both of you see these, both of you can add to them. This is the part of the app that belongs to both of you.',
    privacyPrivateTitle: 'Private',
    privacyPrivateBody:
      'Some notes are only ever yours: the things you’re still working out about how to love someone well, and the gift ideas you don’t want spoiled. Your partner cannot see these, and the app will never show them a count, a hint, or a trace.',
    privacyPromise:
      'This is not a file on your partner. It is your own notebook for paying attention. If a note would embarrass you to have read aloud, it probably belongs in a conversation instead.',
    moneyTitle: 'About the money part',
    moneyBody:
      'Spending here shows one thing: how the total has been carried between you, over time. There is no running tab, no “who owes whom”, and no debt.',
    moneyBody2:
      'When the split drifts, the app suggests who might pick up the next one. That is all it does. A gift marked as a treat is left out of the maths entirely — because a gift is a gift.',
    setupTitle: 'Set up your space',
    setupBody: 'You can change any of this later.',
    createTitle: 'Start a new space',
    createBody: 'Then invite your partner with a code.',
    joinTitle: 'Join your partner',
    joinBody: 'They’ll have a six-character code for you.',
    coupleName: 'What should we call the two of you?',
    coupleNamePlaceholder: 'e.g. Ana & Léo',
    anniversary: 'When did you start?',
    anniversaryHint: 'The day you count from. Used for your day counter and monthiversaries.',
    currency: 'Which currency do you mostly spend in?',
    currencyHint: 'You can log spending in the others too — they’re kept separate, never converted.',
    createSpace: 'Create our space',
    inviteCode: 'Invite code',
    joinSpace: 'Join',
    inviteTitle: 'Now invite them',
    inviteBody:
      'Send this code to your partner. They create an account, choose “Join your partner”, and enter it.',
    inviteCopy: 'Copy code',
    inviteCopied: 'Copied',
    inviteWaiting: 'You can start adding things now — they’ll see everything shared when they join.',
    next: 'Next',
    startUsing: 'Open our space',
  },

  home: {
    greetingMorning: 'Good morning',
    greetingAfternoon: 'Good afternoon',
    greetingEvening: 'Good evening',
    daysTogether: (days: number) => (days === 1 ? '1 day together' : `${days} days together`),
    daysTogetherSince: (date: string) => `since ${date}`,
    setAnniversary: 'Add the day you started',
    nextUp: 'Next up',
    nothingUpcoming: 'Nothing on the horizon',
    nothingUpcomingHint: 'Add a birthday or an anniversary so it never sneaks up on you.',
    remindersTitle: 'Worth knowing',
    balanceTitle: 'Spending',
    quickAdd: 'Quick add',
    quickAddMemory: 'A memory',
    quickAddFact: (name: string) => `Something ${name} said`,
    quickAddExpense: 'An expense',
    quickAddGift: 'A gift idea',
  },

  reminders: {
    upcomingDate: (label: string, countdown: string) => `${label} is ${countdown}`,
    upcomingDateOrdinal: (label: string, ordinal: string, countdown: string) =>
      `${label} — the ${ordinal} — is ${countdown}`,
    giftIdeasSaved: (count: number) =>
      count === 1 ? 'You have 1 idea saved for this.' : `You have ${count} ideas saved for this.`,
    giftIdeasNone: 'Nothing in your gift radar for this yet.',
    factFollowUpBefore: (question: string) => `You noted: ${question}`,
    factFollowUpBeforeHint: 'It’s coming up. Worth mentioning that you remembered.',
    factFollowUpAfter: (question: string) => `You noted: ${question}`,
    factFollowUpAfterHint: 'That was a few days ago — ask how it went.',
    tripOpenItems: (destination: string, count: number) =>
      count === 1
        ? `One thing still open for ${destination}`
        : `${count} things still open for ${destination}`,
    monthiversaryTitle: (months: number) =>
      months === 1 ? 'Your first month' : `Your ${months}-month mark`,
    monthiversaryHint: 'Small, but she’ll notice that you did.',
    dayMilestone: (days: number) => `${days} days together`,
    reunion: 'You see each other again',
  },

  suggestions: {
    title: 'Because you asked',
    kinds: {
      gift: 'They mentioned',
      date: 'Something to do',
      caution: 'Worth remembering',
      repeat: 'Again?',
    },
    youAsked: (question: string) => `You asked: ${question}`,
    repeatLead: (title: string) => `${title} went well. It’s been a while.`,
    /* The app quotes and stops. Saying so out loud is the difference
       between a suggestion that flatters the reader and one that takes
       credit for their partner's words. */
    footnote:
      'These are their own words, brought back when they’re useful. The app doesn’t interpret them — that part is yours.',
  },

  vault: {
    title: 'About her',
    subtitle: 'What you’ve learned, so you don’t have to guess.',
    intro:
      'The point of this page is to stop you spinning. When you find yourself wondering what the silence means, look here first — you probably already asked.',
    /* The field that decides whether an answer can ever come back as
       something useful. Worded as "what kind of thing is this" rather than
       "answer type", because nobody thinks of their partner's favourite
       flower as a data category. */
    answerKind: 'What kind of thing is this?',
    answerKindHint:
      'Decides whether this can come back later as an idea. Something they like can; something about how they work is just worth knowing.',
    answerKinds: {
      insight: 'How they work',
      taste: 'Something they like',
      place: 'Somewhere',
      activity: 'Something to do',
      boundary: 'A line',
      date: 'A date',
    },
    answerKindHints: {
      insight: 'Shapes how you talk to them. Never becomes a suggestion.',
      taste: 'A food, a flower, a song. Can come back as a gift idea.',
      place: 'Somewhere they like or want to go.',
      activity: 'Can come back as something to plan.',
      boundary: 'Used to stop an idea, never to make one.',
      date: 'Something with a day attached.',
    },

    addFact: 'Add something',
    editFact: 'Edit note',
    question: 'What you asked',
    questionPlaceholder: 'e.g. When you go quiet, what does it usually mean?',
    answer: 'What she said',
    answerPlaceholder: 'In her words, as close as you can remember.',
    category: 'Category',
    visibility: 'Who can see this',
    remindOn: 'Remind me around',
    remindOnHint: 'For things with a date on them — an exam, a result, a difficult call.',
    searchPlaceholder: 'Search everything you’ve written',
    emptyTitle: 'Nothing written down yet',
    emptyBody:
      'Start with one thing she told you this week. The small ones matter most — they’re the ones you forget.',
    emptyFiltered: 'Nothing here in this category yet.',
    promptsTitle: 'Things worth asking',
    promptsBody: 'Not a checklist. One at a time, when it fits.',
    promptsAnswer: 'Write what she said',
    promptsDismiss: 'Skip this one',
    countShared: (n: number) => `${n} shared`,
    countPrivate: (n: number) => `${n} private`,
    privateNoteBody: 'Yours alone — your own working notes on paying better attention.',
  },

  dates: {
    title: 'Dates',
    subtitle: 'So none of them ever arrive as a surprise.',
    add: 'Add a date',
    edit: 'Edit date',
    label: 'What is it?',
    labelPlaceholder: 'e.g. Her birthday',
    date: 'When',
    type: 'Kind',
    recurring: 'Comes around again',
    recurringHint: 'Birthdays and anniversaries usually do. First-time milestones usually don’t.',
    upcoming: 'Coming up',
    past: 'Already happened',
    emptyTitle: 'No dates yet',
    emptyBody:
      'Her birthday is the one to start with. Then the day you met, and the day you count from.',
    ordinal: (n: number) => {
      const suffix =
        n % 100 >= 11 && n % 100 <= 13
          ? 'th'
          : n % 10 === 1
            ? 'st'
            : n % 10 === 2
              ? 'nd'
              : n % 10 === 3
                ? 'rd'
                : 'th';
      return `${n}${suffix}`;
    },
    turning: (n: number) => `turning ${n}`,
    monthMark: (n: number) => `${n} months`,
  },

  memories: {
    title: 'Memories',
    subtitle: 'The story, in the order it happened.',
    add: 'Add a memory',
    edit: 'Edit memory',
    memoryTitle: 'What happened',
    titlePlaceholder: 'e.g. The night it rained in Porto',
    note: 'Tell it',
    notePlaceholder: 'Write it the way you’d tell it to her in a year.',
    date: 'When',
    photo: 'Photos',
    photoAdd: 'Add photos',
    photoReplace: 'Replace photo',
    photoRemove: 'Remove photo',
    photoAlt: (title: string) => `Photo from: ${title}`,

    /* A memory holds a handful of photographs, not one — a day is a handful
       of pictures with one story attached, which is what a page of an album
       is. These are the words for that. */
    addPhotos: 'Add photos here',
    removePhoto: 'Remove this one',
    previousPhoto: 'Previous photo',
    nextPhoto: 'Next photo',
    slideCount: (n: number, total: number) => `${n} of ${total}`,
    photoOf: (n: number, total: number) =>
      total === 1 ? '1 photo' : `Photo ${n} of ${total} from this day`,
    pageCount: (n: number) => (n === 1 ? '1 photo' : `${n} photos`),
    noPhotos: 'No photos yet',
    openBook: (title: string) => `Open ${title}`,
    emptyTitle: 'The first page is blank',
    emptyBody: 'Start anywhere. The first thing you remember about her is a good place.',
    uploading: 'Uploading…',
  },

  family: {
    title: 'Family',
    subtitle: 'Names, ages, and what to be careful with.',
    intro:
      'In a lot of families — hers especially — remembering who is who is not trivia. It’s respect.',
    add: 'Add someone',
    edit: 'Edit person',
    name: 'Name',
    namePlaceholder: 'e.g. Mei',
    relation: 'Relation',
    relationPlaceholder: 'e.g. Mother, older brother, grandmother on her father’s side',
    age: 'Age',
    birthday: 'Birthday',
    belongsTo: 'Whose family',
    notes: 'What to know',
    notesPlaceholder: 'e.g. Very close to her, calls every Sunday. Don’t bring up the move.',
    sensitive: 'Handle with care',
    sensitiveHint: 'Marks this person as one to be thoughtful about.',
    emptyTitle: 'No one added yet',
    emptyBody:
      'Start with her mother and father, and anyone she talks about every week. Names first — the rest can come later.',
  },

  phrasebook: {
    title: 'Phrasebook',
    subtitle: 'Her language, one phrase at a time.',
    intro:
      'Learning even a little of someone’s first language is one of the kindest things you can do with an hour.',
    add: 'Add a phrase',
    edit: 'Edit phrase',
    original: 'In her language',
    originalPlaceholder: '你今天怎么样？',
    reading: 'How to say it',
    readingPlaceholder: 'nǐ jīntiān zěnmeyàng?',
    translation: 'What it means',
    translationPlaceholder: 'How was your day?',
    note: 'A note',
    notePlaceholder: 'When to use it, or what she said about it.',
    audio: 'Recording',
    audioAdd: 'Add a recording',
    audioHint: 'Ask her to say it once — it’s worth more than any app.',
    audioRemove: 'Remove recording',
    learned: 'Learned',
    notLearned: 'Still learning',
    markLearned: 'Mark as learned',
    markNotLearned: 'Move back to learning',
    practice: 'Practise',
    practiceStop: 'Stop practising',
    practiceReveal: 'Show me',
    practiceNext: 'Next',
    practiceEmpty: 'Add a couple of phrases first, then come back to practise.',
    practiceDone: 'That’s all of them. Again?',
    progress: (done: number, total: number) => `${done} of ${total} learned`,
    emptyTitle: 'No phrases yet',
    emptyBody:
      'Add the first thing she taught you to say. Even if you say it badly — especially if you say it badly.',
  },

  culture: {
    title: 'Culture',
    subtitle: 'The rules nobody writes down.',
    intro:
      'Every culture has things that are obvious to the people inside it. Write them down as you learn them, and you’ll stop finding out the hard way.',
    add: 'Add a note',
    edit: 'Edit note',
    noteTitle: 'What is it?',
    titlePlaceholder: 'e.g. Never give a clock as a gift',
    note: 'Why it matters',
    notePlaceholder: 'What it means, and what to do instead.',
    category: 'Kind',
    emptyTitle: 'Nothing written down yet',
    emptyBody:
      'Start with something she’s already told you — a food she can’t stand, a number that matters, a thing her family always does.',
  },

  trips: {
    title: 'Trips',
    subtitle: 'Tickets, plans and budget in one place.',
    add: 'Plan a trip',
    edit: 'Edit trip',
    destination: 'Where',
    destinationPlaceholder: 'e.g. Lisbon',
    startDate: 'From',
    endDate: 'Until',
    budget: 'Budget',
    budgetHint: 'Roughly what you want to keep it under.',
    notes: 'Notes',
    notesPlaceholder: 'Anything you want to remember about this one.',
    emptyTitle: 'No trips planned',
    emptyBody: 'Even a weekend counts. Put in the dates and the rest can follow.',
    upcoming: 'Coming up',
    pastTrips: 'Been there',
    nights: (n: number) => (n === 1 ? '1 night' : `${n} nights`),
    items: 'Plan',
    addItem: 'Add to the plan',
    editItem: 'Edit item',
    itemTitle: 'What',
    itemTitlePlaceholder: 'e.g. Flight TP1234',
    itemType: 'Kind',
    itemDay: 'Which day',
    itemTime: 'Time',
    itemNote: 'Details',
    itemAttachment: 'Ticket or document',
    itemAttachmentAdd: 'Attach a file',
    itemAttachmentOpen: 'Open',
    itemAttachmentRemove: 'Remove file',
    itemsEmptyTitle: 'Nothing planned yet',
    itemsEmptyBody: 'Flights, where you’re staying, the one thing you both want to do.',
    unscheduled: 'Not on a day yet',
    budgetSpent: (spent: string, total: string) => `${spent} of ${total}`,
    budgetLeft: (amount: string) => `${amount} left`,
    budgetOver: (amount: string) => `${amount} over`,
    noBudget: 'No budget set',
    linkedExpenses: (n: number) => (n === 1 ? '1 expense' : `${n} expenses`),
    progress: (done: number, total: number) => `${done} of ${total} sorted`,
  },

  spending: {
    title: 'Spending',
    subtitle: 'How it’s been carried, between the two of you.',
    philosophy:
      'No tab, no debt, no score. Just how the total has been shared so far, and a nudge when it drifts.',
    philosophyMore:
      'Treats are left out of the maths on purpose. Something you gave freely shouldn’t come back later as leverage.',
    add: 'Log an expense',
    edit: 'Edit expense',
    label: 'What for',
    labelPlaceholder: 'e.g. Dinner at the place by the river',
    amount: 'How much',
    currency: 'Currency',
    paidBy: 'Who paid',
    date: 'When',
    category: 'Kind',
    splitRule: 'How it’s split',
    customPercent: 'Their share',
    customPercentHint: (a: string, aPct: number, b: string, bPct: number) =>
      `${a} carries ${aPct}%, ${b} carries ${bPct}%.`,
    trip: 'Part of a trip',
    noTrip: 'Not part of a trip',
    note: 'Note',
    balanceTitle: 'Where things stand',
    balanceEven: 'You’re even',
    balanceEvenBody: 'Nothing to think about. It’s been shared fairly.',
    balanceNothing: 'Nothing logged yet',
    balanceNothingBody: 'Once you log a few things, you’ll see how it’s been shared.',
    rebalanceTitle: 'To even it out naturally',
    rebalanceBody: (name: string, amount: string) => `The next ${amount} is on ${name}.`,
    // Deliberately does not reach for the word "owed", even to deny it.
    // Naming the idea in order to dismiss it still puts it in the room.
    rebalanceHint: 'No rush. It’s just the number that would bring the split back level.',
    totalShared: (amount: string) => `${amount} shared so far`,
    treatsTitle: 'Treats',
    treatsBody: 'Given freely, and kept out of the maths.',
    treatsBy: (name: string, amount: string) => `${name} gave ${amount}`,
    history: 'Everything logged',
    emptyTitle: 'Nothing logged yet',
    emptyBody:
      'Add the last thing either of you paid for. It takes a few seconds and it saves the conversation later.',
    byCategory: 'Where it goes',
    treatBadge: 'Treat',
    splitBadge: (pct: number) => `${pct}%`,
    /* Shown when an expense was written down with no network, so it has no
       frozen rate and cannot join the total. Naming the count matters: a
       money page that quietly omits rows is worse than one that admits it. */
    notConverted: (n: number) =>
      n === 1
        ? '1 expense was recorded offline and has no exchange rate, so it isn’t in this total.'
        : `${n} expenses were recorded offline and have no exchange rate, so they aren’t in this total.`,
    convertNow: 'Use today’s rate for those',
  },

  splitRules: {
    '50_50': 'Down the middle',
    custom_pct: 'A share each',
    treat: 'My treat',
    '50_50Hint': 'Split evenly.',
    custom_pctHint: 'For when your incomes aren’t the same.',
    treatHint: 'A gift. Left out of the balance entirely.',
  },

  gifts: {
    title: 'Gift radar',
    subtitle: 'Things she mentioned, saved quietly.',
    privateNotice: 'Only you can see this page. Your partner cannot, ever.',
    intro:
      'The best gift is something she said out loud months ago and forgot she said. Write it down the moment you hear it.',
    add: 'Save an idea',
    edit: 'Edit idea',
    idea: 'The idea',
    ideaPlaceholder: 'e.g. The ceramics class she keeps mentioning',
    occasion: 'For when',
    occasionPlaceholder: 'e.g. Her birthday',
    occasionHint: 'Match this to a date and the home screen will remind you in time.',
    noticedOn: 'You noticed',
    note: 'Details',
    notePlaceholder: 'Size, colour, the shop she pointed at.',
    used: 'Already given',
    markUsed: 'Mark as given',
    markUnused: 'Move back to ideas',
    ideasTitle: 'Saved',
    usedTitle: 'Already given',
    emptyTitle: 'Nothing saved yet',
    emptyBody:
      'Next time she says “oh, I love those” — put it here. That’s the whole trick.',
  },

  distance: {
    title: 'Distance',
    subtitle: 'The days until you’re in the same place.',
    enable: 'Turn on distance mode',
    enableHint: 'A countdown to the next time you see each other, and somewhere to write to each other.',
    disable: 'Turn off distance mode',
    reunionDate: 'Next time you see each other',
    reunionNote: 'Notes for the meantime',
    reunionNotePlaceholder: 'Plans, things to do together, what to bring.',
    countdown: (days: number) => (days === 1 ? '1 day' : `${days} days`),
    untilTitle: 'Until you’re together',
    todayTitle: 'Today’s the day',
    todayBody: 'Close the app.',
    passedTitle: 'That date has passed',
    passedBody: 'Set the next one when you know it.',
    emptyTitle: 'No date set',
    emptyBody: 'Put in the next time you’ll be in the same room.',
  },

  settings: {
    title: 'Settings',
    space: 'Your space',
    coupleName: 'Name',
    anniversary: 'The day you count from',
    currency: 'Main currency',
    you: 'You',
    displayName: 'Your name',
    partner: 'Your partner',
    partnerNotJoined: 'Hasn’t joined yet',
    partnerInvite: 'Share your invite code with them.',
    inviteCode: 'Invite code',
    rotateCode: 'Get a new code',
    rotateCodeHint: 'The old one stops working.',
    rotateConfirm: 'Replace the invite code?',
    rotateConfirmBody: 'Anyone holding the old code will no longer be able to join.',
    appearance: 'Appearance',
    theme: 'Theme',
    themeLight: 'Light',
    themeDark: 'Dark',
    themeSystem: 'Match my device',
    language: 'Language',
    distanceMode: 'Distance mode',
    togetherMode: 'Together log',
    places: 'Places',
    privacy: 'Privacy',
    privacyBody:
      'Shared pages are visible to both of you. Your private notes and your gift radar are visible only to you — enforced by the database, not just hidden in the app.',
    signOut: 'Sign out',
    roleA: 'Partner A',
    roleB: 'Partner B',
    roleHint: 'Only used to label who paid for what.',
    /* The cultural profile. Per person, because the entire point is that
       the two answers differ — a shared field would erase the thing the app
       exists to help with. */
    origin: 'Where you’re from',
    originHint:
      'Used for the holidays the app watches for you, and nothing else. Your partner sees which country you picked — that is the point of it.',
    homeCountry: 'Your country',
    homeCountryNone: 'Rather not say',
    nativeLanguage: 'Your first language',
    sharedLanguage: 'What the two of you speak together',
    sharedLanguageHint:
      'Often neither of your first languages. Worth naming: two people both working in a second language explains a lot of friction that otherwise gets blamed on character.',
    partnerOrigin: (name: string, country: string) => `${name} is from ${country}.`,
    partnerOriginUnset: (name: string) => `${name} hasn’t said where they’re from yet.`,

    yours: 'Make it yours',
    weekStarts: 'The week starts on',
    weekStartsHint:
      'Brazil says Sunday, China says Monday, and every calendar either of you grew up with disagrees with the other. Pick one.',
    sunday: 'Sunday',
    monday: 'Monday',
    accent: 'Accent',
    accentHint: 'The colour of the seal, the active marks, the small emphases.',
    accents: {
      cinnabar: 'Cinnabar',
      jade: 'Jade',
      amber: 'Amber',
      ink: 'Ink',
    },
    sealText: 'What’s on the seal',
    sealTextHint:
      'Up to four characters. A word for the two of you, two initials, 我们 — whatever you’d actually carve.',
    pinned: 'Your bottom bar',
    pinnedHint:
      'Four places, chosen by you and not by us. This one is yours alone — your partner keeps their own.',
    pinnedReset: 'Back to the defaults',
    pinnedFull: 'Four is the most that fits. Unpin one first.',
    nudges: 'Let the app nudge me',
    nudgesHint:
      'The quiet-fortnight note on Letters, and nothing else. Some people find it useful; some find being nudged about their own relationship insufferable. Both fair.',
    leaveCouple: 'Leave this space',
    leaveCoupleHint:
      'Pairs the wrong way round, or a code typed by a stranger — this is the way out.',
    leaveConfirm: 'Leave this space?',
    leaveConfirmBody:
      'Nothing is deleted; you simply stop being part of it, and you can create or join another. Rejoining needs the invite code again.',
  },

  calendar: {
    title: 'Calendar',
    subtitle: 'What’s coming, and what already happened.',
    today: 'Today',
    previousMonth: 'Previous month',
    nextMonth: 'Next month',
    backToToday: 'Back to today',
    nothingOn: (date: string) => `Nothing on ${date} yet.`,
    addPlan: 'Add a plan',
    /* The day panel and the "what's coming" empty state both offer to add a
       plan, and they target different days — the selected one and today.
       Two buttons with one name that do two things is a maze for anyone
       navigating by name, so the empty state's says which. */
    addPlanFirst: 'Plan your first thing',
    editPlan: 'Edit plan',
    planTitle: 'What are you doing?',
    planTitlePlaceholder: 'e.g. That Japanese place she mentioned',
    planDay: 'Which day',
    planTime: 'Time',
    planLocation: 'Where',
    planLocationPlaceholder: 'e.g. Rua das Flores, 40',
    planNote: 'Notes',
    planKind: 'Kind',
    planDone: 'Already happened',
    upcoming: 'Coming up',
    legend: 'On this calendar',
    legendPlan: 'Plans',
    legendDate: 'Dates that matter',
    legendTrip: 'Trips',
    legendIntimacy: 'Together',
    emptyTitle: 'Nothing planned yet',
    emptyBody:
      'Put in the next thing you’re doing together — even if it’s just a film on Sunday. Half of a good date is looking forward to it.',
    weekdays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  },

  planKinds: {
    date: 'A date',
    celebration: 'A celebration',
    outing: 'An outing',
    other: 'Something else',
  },

  arrivals: {
    title: 'Home safe',
    imHere: (place: string) => `I’m at ${place}`,
    imHome: 'I’m home',
    arrived: 'Sent',
    arrivedAt: (name: string, place: string) => `${name} arrived at ${place}`,
    lastSeen: 'Recently',
    noneYet: 'No arrivals yet',
    noneYetBody:
      'One tap tells them you got in, so neither of you has to write the message.',
    savePlace: 'Save a place',
    editPlace: 'Edit place',
    placeLabel: 'Call it what?',
    placeLabelPlaceholder: 'e.g. Home',
    placeRadius: 'How close counts as “there”',
    placeRadiusHint: 'Phone GPS is easily off by a block, so anything under 100 m tends to never trigger.',
    useCurrentLocation: 'Use where I am now',
    locating: 'Finding you…',
    locationDenied:
      'Your browser refused the location. You can still save a place by hand, and the button always works.',
    locationUnavailable: 'Couldn’t get a location just now.',
    autoCheckin: 'Notice when I arrive',
    autoCheckinHint:
      'While the app is open, it can spot that you’ve reached a saved place and send the arrival for you.',
    autoCheckinLimit:
      'The web has no background location: this only works with the app open, and never records where you’ve been — only that you arrived.',
    placesTitle: 'Your places',
    placesEmpty: 'No places saved. The button still works without them.',
    detectedAt: (place: string) => `Looks like you’re at ${place}.`,
    detectedSend: 'Let them know',
  },

  together: {
    title: 'Together',
    subtitle: 'Yours both, and nobody else’s.',
    intro:
      'A private record of the two of you — kept because it’s nice to look back on, not because anything here is a target.',
    enable: 'Turn on the together log',
    enableHint: 'Adds a private page and small marks on the calendar. Off unless you want it.',
    disable: 'Turn off the together log',
    disabledTitle: 'Not switched on',
    disabledBody:
      'This one is off by default. You can turn it on in Settings, and turning it off again hides the page without deleting anything.',
    add: 'Add',
    edit: 'Edit',
    date: 'When',
    kind: 'What',
    place: 'Where',
    placePlaceholder: 'e.g. the kitchen, that hotel in Lisbon',
    note: 'Anything to remember',
    total: 'All time',
    thisMonth: 'This month',
    lastThirty: 'Last 30 days',
    activeDays: 'Days',
    daysSince: (days: number) =>
      days === 0 ? 'Today' : days === 1 ? 'Yesterday' : `${days} days ago`,
    daysSinceLabel: 'Last time',
    byKind: 'What, mostly',
    places: 'Where, mostly',
    byMonth: 'Month by month',
    history: 'Everything',
    emptyTitle: 'Nothing logged yet',
    emptyBody: 'Add the last time. It takes five seconds and it’s lovely a year from now.',
    privacyNote:
      'Only the two of you can read this, enforced by the database. Nothing here is shown anywhere else in the app.',
    countOf: (n: number) => (n === 1 ? '1 time' : `${n} times`),
  },

  intimacyKinds: {
    affection: 'Closeness',
    kiss: 'Kissing',
    massage: 'Massage',
    foreplay: 'Foreplay',
    sex: 'Sex',
    other: 'Something else',
  },

  flowers: {
    counter: 'Flowers',
    offerTitle: 'A flower turned up',
    offerBody: 'Send one across. No reason needed — that’s rather the point.',
    send: 'Send it',
    sent: 'On its way',
    notNow: 'Maybe later',
    receivedTitle: 'Flowers you’ve been given',
    receivedNone: 'None yet. They arrive when they arrive.',
    receivedTotal: (n: number) => (n === 1 ? '1 flower' : `${n} flowers`),
    fromPartner: (name: string) => `from ${name}`,
    newOnes: (n: number) => (n === 1 ? '1 new' : `${n} new`),
    meaningTitle: 'What it means',
    kinds: {
      rose: {
        name: 'Pink rose',
        meaning: 'Gratitude, and quiet admiration. The one you send for no occasion.',
      },
      peony: {
        name: 'Peony 牡丹',
        meaning:
          'The king of flowers in China: prosperous love, honour, a wish for a good life together.',
      },
      cherry: {
        name: 'Cherry blossom 樱花',
        meaning:
          'Beauty that doesn’t last, which is why it matters. A reminder to notice the day you’re in.',
      },
    },
  },

  letters: {
    title: 'Letters',
    subtitle: 'The things that aren’t worth a phone call, which turn out to be most of them.',
    empty:
      'Nothing on the shelf yet. The first one is the awkward one; after that it stops being a gesture and starts being a habit.',
    write: 'Write one',
    /* Distinct from `write` on purpose: both appear on an empty shelf, and
       two buttons with the same accessible name in one view is a small mess
       for anyone navigating by name. */
    writeFirst: 'Write the first one',
    editing: 'Edit letter',
    to: (name: string) => `To ${name}`,
    from: (name: string) => `From ${name}`,
    body: 'What you want to say',
    bodyPlaceholder: 'It doesn’t have to be good. It has to be true.',
    kind: 'What kind',
    kinds: {
      thanks: {
        name: 'Thank you',
        hint: 'Something they did. Name the specific thing — it lands harder than “you’re wonderful”.',
      },
      small: {
        name: 'Something small',
        hint: 'The bread, the song, the thing you saw and thought of them. Too minor to call about, which is exactly why it belongs here.',
      },
      sorry: {
        name: 'Repair',
        hint: 'After a bad one. Written and slow, so neither of you has to read the other’s tone.',
      },
      love: {
        name: 'No occasion',
        hint: 'No reason. Those are the ones that get reread.',
      },
    },
    seal: 'Seal it until a day',
    sealHint:
      'They won’t be able to open it — or even see that it exists — before then. That’s enforced by the database, not by the app being polite.',
    sealedUntil: (date: string) => `Sealed until ${date}`,
    sealedNote: 'You can still change or unsend this until it opens.',
    unread: 'New',
    unreadCount: (n: number) => (n === 1 ? '1 unopened' : `${n} unopened`),
    opened: 'Opened',
    notOpenedYet: 'Not opened yet',
    open: 'Open it',
    shelf: (n: number) =>
      n === 1 ? '1 letter between you' : `${n} letters between you, and counting`,
    quiet: (days: number) =>
      `It’s been ${days} days since either of you left one. Not a reproach — just the sort of thing that slips.`,
    quietAction: 'Write something small',
    readingNote:
      'Written to be reread. On a bad month, the shelf is more use than anything either of you can say in the moment.',
    deleteConfirm: 'Unsend this letter?',
    deleteConfirmBody: 'It hasn’t been opened, so it disappears entirely.',
    cannotDelete: 'Already opened — this one’s theirs now.',
  },

  clocks: {
    title: 'Two clocks',
    you: 'You',
    hoursApart: (hours: number) => (hours === 1 ? '1 hour apart' : `${hours} hours apart`),
    tomorrow: '· tomorrow',
    yesterday: '· yesterday',
    window: (yours: string, theirs: string, name: string) =>
      `${yours} for you — ${theirs} for ${name}`,
    totalOverlap: (hours: number) =>
      hours === 1 ? '1 hour a day you’re both up' : `${hours} hours a day you’re both up`,
    noOverlap:
      'Your waking hours don’t currently overlap at all. Widening one of them in Settings might be the kindest fix.',
    timeZone: 'Your time zone',
    timeZoneHint: 'Used to work out when you’re both awake. Nobody sees your location — only the zone.',
    awake: 'You’re usually up between',
    /* The two selects sit under one visible heading. Sighted readers get the
       pairing from the layout; anyone using a screen reader was getting two
       unnamed dropdowns, so each carries a hidden name of its own. */
    awakeFrom: 'Usually up from',
    awakeUntil: 'Usually up until',
    awakeHint: 'Rough is fine. It only decides when the app suggests calling.',
    useDevice: 'Use my device’s zone',
  },

  holidays: {
    title: 'Coming up where you’re from',
    tabulatedNote: 'Lunisolar dates come from a checked table and stop after 2030.',
    /* Which country a date belongs to. Shown beside it, because "it's her
       country's day, not yours" is the single most useful thing the app can
       tell somebody here. */
    countries: {
      BR: 'Brazil',
      CN: 'China',
      IT: 'Italy',
      PT: 'Portugal',
      US: 'United States',
      ES: 'Spain',
      FR: 'France',
      DE: 'Germany',
      GB: 'United Kingdom',
      MX: 'Mexico',
      JP: 'Japan',
      KR: 'South Korea',
    } as Record<string, string>,
    ids: {
      /* Universal */
      new_year: { name: 'New Year', note: '' },
      christmas: { name: 'Christmas', note: '' },

      /* Brazil */
      carnaval: { name: 'Carnaval', note: 'Moves with Easter every year.' },
      dia_dos_namorados: {
        name: 'Dia dos Namorados',
        note: 'Brazil’s lovers’ day is 12 June, not 14 February. This one catches every foreign partner out.',
      },
      sao_joao: { name: 'São João', note: 'Festa junina — quadrilha, canjica, bonfires.' },
      independencia_br: { name: 'Independência', note: '' },

      /* China */
      chinese_new_year: {
        name: 'Chinese New Year 春节',
        note: 'The family holiday. Being wished well on it lands; forgetting it does not go unnoticed.',
      },
      qixi: {
        name: 'Qixi 七夕',
        note: 'China’s own lovers’ day. Not 14 February — and this is the one that matters.',
      },
      dragon_boat: { name: 'Dragon Boat 端午节', note: 'Zongzi, and a long weekend.' },
      mid_autumn: { name: 'Mid-Autumn 中秋节', note: 'Family, mooncakes, the full moon.' },
      national_day_cn: {
        name: 'National Day 国庆节',
        note: 'Golden Week — they may be travelling to family.',
      },

      /* Italy */
      san_valentino: { name: 'San Valentino', note: '' },
      epifania: { name: 'Epifania', note: 'La Befana — the stocking comes now, not at Christmas.' },
      festa_repubblica: { name: 'Festa della Repubblica', note: '' },
      ferragosto: { name: 'Ferragosto', note: 'Italy closes. Nothing gets done in August.' },

      /* Portugal */
      dia_dos_namorados_pt: { name: 'Dia dos Namorados', note: 'In Portugal it is 14 February.' },
      dia_de_portugal: { name: 'Dia de Portugal', note: '' },
      santo_antonio: { name: 'Santo António', note: 'Lisbon’s night — sardines and paper streamers.' },

      /* United States */
      valentines: { name: 'Valentine’s Day', note: '' },
      independence_us: { name: 'Independence Day', note: '' },
      thanksgiving_us: { name: 'Thanksgiving', note: 'Family, and travel. The fourth Thursday.' },

      /* Spain */
      san_valentin: { name: 'San Valentín', note: '' },
      reyes: { name: 'Reyes', note: 'The presents come on 6 January, not on the 25th.' },
      hispanidad: { name: 'Día de la Hispanidad', note: '' },

      /* France */
      saint_valentin: { name: 'Saint-Valentin', note: '' },
      bastille: { name: 'Quatorze Juillet', note: '' },
      fete_musique: { name: 'Fête de la Musique', note: 'The whole country plays outside.' },

      /* Germany */
      valentinstag: { name: 'Valentinstag', note: '' },
      nikolaus: { name: 'Nikolaustag', note: 'Boots by the door on the night of the 5th.' },
      einheit: { name: 'Tag der Deutschen Einheit', note: '' },

      /* United Kingdom */
      bonfire_night: { name: 'Bonfire Night', note: '' },
      boxing_day: { name: 'Boxing Day', note: '' },

      /* Mexico */
      valentines_mx: { name: 'Día del Amor y la Amistad', note: 'Friends too, not only couples.' },
      independencia_mx: { name: 'Independencia', note: 'The Grito is the night of the 15th.' },
      dia_de_muertos: { name: 'Día de Muertos', note: 'For remembering, not for mourning.' },

      /* Japan */
      white_day: {
        name: 'White Day',
        note: 'A month after 14 February, the gift goes back the other way. Forgetting the second half is the classic mistake.',
      },
      tanabata: { name: 'Tanabata 七夕', note: 'A wish on a strip of paper, tied to bamboo.' },
      golden_week: { name: 'Golden Week', note: 'A week of holidays; everything is booked.' },

      /* South Korea */
      pepero_day: { name: 'Pepero Day 빼빼로데이', note: '11/11, for the shape of the biscuit.' },
      chuseok: { name: 'Chuseok 추석', note: 'The harvest holiday. Family, and a long journey.' },
    } as Record<string, { name: string; note: string }>,
  },

  factCategories: {
    communication: 'How we talk',
    love_language: 'What love looks like',
    culture: 'Where she’s from',
    preferences: 'What she likes',
    boundaries: 'Her lines',
    past: 'What came before',
    other: 'Everything else',
  },

  expenseCategories: {
    food: 'Food',
    transport: 'Travel',
    stay: 'Stay',
    activity: 'Doing things',
    gift: 'Gifts',
    home: 'Home',
    health: 'Health',
    other: 'Other',
  },

  cultureCategories: {
    lucky: 'Lucky',
    unlucky: 'Avoid',
    tradition: 'Traditions',
    food: 'Food',
    etiquette: 'Manners',
    gift: 'Giving gifts',
  },

  dateTypes: {
    birthday: 'Birthday',
    anniversary: 'Anniversary',
    monthiversary: 'Monthiversary',
    milestone: 'First time',
    custom: 'Something else',
  },

  tripItemTypes: {
    flight: 'Travel',
    stay: 'Stay',
    activity: 'To do',
    doc: 'Document',
  },

  countdown: {
    today: 'today',
    tomorrow: 'tomorrow',
    yesterday: 'yesterday',
    inDays: (days: number) => `in ${days} days`,
    inWeeks: (weeks: number) => (weeks === 1 ? 'in a week' : `in ${weeks} weeks`),
    daysAgo: (days: number) => `${days} days ago`,
  },

  errors: {
    generic: 'That didn’t work. Try again in a moment.',
    notConfigured: 'The app isn’t connected to a database yet.',
    notConfiguredBody:
      'It needs one build-time variable. Below is exactly what this build received.',
    notConfiguredSaw: 'What this build received',
    notConfiguredMissing: 'not found',
    notConfiguredKeyFound: (length: number, prefix: string) =>
      `found — ${length} characters, starts with ${prefix}`,
    notConfiguredProject: 'Project',
    notConfiguredProjectBuiltIn: 'built in — no variable needed',
    notConfiguredProjectFromEnv: 'from VITE_SUPABASE_URL',
    notConfiguredLocal: 'Running locally',
    notConfiguredLocalBody:
      'Copy .env.example to .env, paste the key, then restart the dev server. Vite only reads it on start-up.',
    notConfiguredHosted: 'Deployed on Vercel',
    notConfiguredHostedBody:
      'Add it under Settings → Environment Variables with the Production environment ticked, then redeploy. Saving it is not enough on its own: Vite bakes the value into the bundle at build time, so only a build that runs after it was saved will have it.',
    notConfiguredNames:
      'The name must match exactly, VITE_ prefix included — anything else is ignored by the browser build.',
    notConfiguredReceived: 'Every VITE_ name this build received',
    notConfiguredReceivedNone:
      'None at all. No VITE_ variable reached this build, so either none are saved or this build predates saving them.',
    notConfiguredWhere:
      'The key is in your Supabase dashboard under Project Settings → API, labelled anon public.',
    signIn: 'That email and password didn’t match.',
    signUp: 'Couldn’t create that account.',
    weakPassword: 'Use at least 8 characters.',
    invalidEmail: 'That doesn’t look like an email address.',
    nameRequired: 'A name would help.',
    amountRequired: 'Enter an amount.',
    amountInvalid: 'That doesn’t look like a number.',
    inviteInvalid: 'That code doesn’t match anything.',
    inviteFull: 'That space already has two people in it.',
    alreadyPaired: 'You’re already part of a couple.',
    uploadTooLarge: 'That file is too big — 10 MB is the limit.',
    uploadFailed: 'The upload didn’t finish.',
    notFound: 'That isn’t here anymore.',

    /* What a failed write says. The missing-schema one exists because a
       settings page whose controls all silently do nothing is genuinely
       hard to tell apart from a broken app. */
    writeTitle: 'That change didn’t save',
    writeMissingSchema:
      'The database is missing something this needs. Run the migrations in supabase/migrations/ that you haven’t run yet, in order, in the Supabase SQL editor — then try again.',
    writeNotAllowed:
      'The database refused it. If this is something you should be able to change, it’s a bug worth reporting.',
    writeRejected: 'The database wouldn’t accept that value.',
    writeOffline: 'Couldn’t reach the server. It’ll need another go once you’re back online.',
    writeUnknown: 'Something went wrong on the way to the server.',
    writeDismiss: 'Dismiss',
  },
} as const;

export type Strings = typeof en;
