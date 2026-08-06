/**
 * Hand-written database types.
 *
 * These mirror /supabase/migrations exactly and are what `supabase gen types
 * typescript` would produce, kept by hand so the repo needs no generation
 * step. They exist so the app can be strictly typed end to end without a
 * single `any` at the network boundary.
 *
 * If you change a migration, change the matching Row here.
 */

export type PartnerRoleColumn = 'partner_a' | 'partner_b';
export type CurrencyColumn = 'EUR' | 'BRL' | 'CNY' | 'USD';
export type VisibilityColumn = 'shared' | 'private';
export type SplitRuleColumn = '50_50' | 'custom_pct' | 'treat';
export type FactCategoryColumn =
  | 'communication'
  | 'love_language'
  | 'culture'
  | 'preferences'
  | 'boundaries'
  | 'past'
  | 'other';
export type ExpenseCategoryColumn =
  | 'food'
  | 'transport'
  | 'stay'
  | 'activity'
  | 'gift'
  | 'home'
  | 'health'
  | 'other';
export type CultureCategoryColumn =
  | 'lucky'
  | 'unlucky'
  | 'tradition'
  | 'food'
  | 'etiquette'
  | 'gift';
export type DateTypeColumn =
  | 'birthday'
  | 'anniversary'
  | 'monthiversary'
  | 'milestone'
  | 'custom';
export type TripItemTypeColumn = 'flight' | 'stay' | 'activity' | 'doc';
export type PlanKindColumn = 'date' | 'celebration' | 'outing' | 'other';
export type IntimacyKindColumn =
  | 'affection'
  | 'kiss'
  | 'massage'
  | 'foreplay'
  | 'sex'
  | 'other';
export type FlowerKindColumn = 'rose' | 'peony' | 'cherry';
export type LetterKindColumn = 'thanks' | 'small' | 'sorry' | 'love';
export type AccentColumn = 'cinnabar' | 'jade' | 'amber' | 'ink';
/** What kind of thing an answer is — the field that makes suggestions possible. */
export type AnswerKindColumn =
  | 'insight'
  | 'taste'
  | 'place'
  | 'activity'
  | 'boundary'
  | 'date';

export type CoupleRow = {
  id: string;
  created_at: string;
  updated_at: string;
  couple_name: string | null;
  anniversary_date: string | null;
  currency: CurrencyColumn;
  invite_code: string;
  distance_mode: boolean;
  reunion_date: string | null;
  reunion_note: string | null;
  intimacy_mode: boolean;
  /** 0 = Sunday, 1 = Monday. */
  week_starts_on: number;
  accent: AccentColumn;
  seal_text: string | null;
  /** Set when the couple has ended. Null while it is running. */
  ended_on: string | null;
  ended_by: string | null;
  created_by: string | null;
}

export type ProfileRow = {
  id: string;
  couple_id: string | null;
  display_name: string;
  role: PartnerRoleColumn | null;
  avatar_path: string | null;
  locale: string;
  auto_checkin: boolean;
  time_zone: string | null;
  awake_start: number;
  awake_end: number;
  /** Route paths pinned to the phone's bottom bar. Empty means the defaults. */
  pinned: string[];
  nudges: boolean;
  /** ISO 3166-1 alpha-2, e.g. 'BR'. Null until asked. */
  home_country: string | null;
  /** ISO 639-1, e.g. 'pt'. */
  native_language: string | null;
  /** What the two of them actually speak together, often neither of the above. */
  shared_language: string | null;
  cycle_tracking: boolean;
  cycle_shared: boolean;
  created_at: string;
  updated_at: string;
}

export type MemoryRow = {
  id: string;
  couple_id: string;
  title: string;
  note: string | null;
  date: string;
  photo_path: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type MemoryPhotoRow = {
  id: string;
  memory_id: string;
  /** Set by a database trigger from the parent memory; never sent by the client. */
  couple_id: string;
  /** A path inside the private bucket, never a URL. */
  path: string;
  caption: string | null;
  sort_order: number;
  created_at: string;
};

export type ImportantDateRow = {
  id: string;
  couple_id: string;
  label: string;
  date: string;
  type: DateTypeColumn;
  recurring: boolean;
  icon: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type RememberFactRow = {
  id: string;
  couple_id: string;
  author_id: string;
  category: FactCategoryColumn;
  question: string;
  answer: string;
  visibility: VisibilityColumn;
  remind_on: string | null;
  /** Key into the question bank in lib/questions.ts, when it came from one. */
  question_id: string | null;
  answer_kind: AnswerKindColumn;
  created_at: string;
  updated_at: string;
}

export type DismissedQuestionRow = {
  id: string;
  couple_id: string;
  author_id: string;
  question_id: string;
  created_at: string;
}

export type FamilyMemberRow = {
  id: string;
  couple_id: string;
  belongs_to: PartnerRoleColumn;
  name: string;
  relation: string;
  age: number | null;
  birthday: string | null;
  notes: string | null;
  sensitive: boolean;
  created_at: string;
  updated_at: string;
}

export type PhraseRow = {
  id: string;
  couple_id: string;
  script_original: string;
  pinyin_or_reading: string | null;
  translation: string;
  audio_path: string | null;
  learned: boolean;
  note: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type CultureNoteRow = {
  id: string;
  couple_id: string;
  title: string;
  note: string;
  category: CultureCategoryColumn;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type TripRow = {
  id: string;
  couple_id: string;
  destination: string;
  start_date: string | null;
  end_date: string | null;
  budget_total_cents: number | null;
  currency: CurrencyColumn;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type TripItemRow = {
  id: string;
  trip_id: string;
  /** Set by a database trigger from the parent trip; never sent by the client. */
  couple_id: string;
  type: TripItemTypeColumn;
  title: string;
  datetime: string | null;
  day: string | null;
  attachment_path: string | null;
  note: string | null;
  done: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export type ExpenseRow = {
  id: string;
  couple_id: string;
  paid_by: PartnerRoleColumn;
  label: string;
  amount_cents: number;
  currency: CurrencyColumn;
  date: string;
  category: ExpenseCategoryColumn;
  split_rule: SplitRuleColumn;
  partner_a_percent: number | null;
  trip_id: string | null;
  note: string | null;
  /**
   * What one unit of `currency` was worth in each currency, on the day this
   * was written down. Null when rates were unreachable then.
   */
  fx: Record<string, number> | null;
  fx_on: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type GiftIdeaRow = {
  id: string;
  couple_id: string;
  author_id: string;
  idea: string;
  occasion: string | null;
  noticed_on: string | null;
  note: string | null;
  used: boolean;
  /** The answer that prompted it — "you saved this because she mentioned it". */
  from_fact_id: string | null;
  created_at: string;
  updated_at: string;
}

export type PlaceRow = {
  id: string;
  couple_id: string;
  label: string;
  latitude: number;
  longitude: number;
  radius_m: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type CheckinRow = {
  id: string;
  couple_id: string;
  profile_id: string;
  place_id: string | null;
  label: string;
  note: string | null;
  automatic: boolean;
  created_at: string;
};

export type PlanRow = {
  id: string;
  couple_id: string;
  title: string;
  day: string;
  time_of_day: string | null;
  location: string | null;
  note: string | null;
  kind: PlanKindColumn;
  done: boolean;
  /** Whether it was worth repeating. Null until somebody says. */
  went_well: boolean | null;
  reflection: string | null;
  tags: string[];
  /** The album page it became. */
  memory_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type CycleEventRow = {
  id: string;
  profile_id: string;
  /** Set by a trigger from the profile; never sent by the client. */
  couple_id: string;
  started_on: string;
  note: string | null;
  created_at: string;
};

export type IntimacyEntryRow = {
  id: string;
  couple_id: string;
  date: string;
  kind: IntimacyKindColumn;
  place: string | null;
  note: string | null;
  mood: number | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type FlowerRow = {
  id: string;
  couple_id: string;
  from_profile: string;
  to_profile: string;
  kind: FlowerKindColumn;
  note: string | null;
  seen: boolean;
  created_at: string;
};

export type LetterRow = {
  id: string;
  couple_id: string;
  from_profile: string;
  to_profile: string;
  kind: LetterKindColumn;
  body: string;
  /** Sealed until this day; null means readable now. */
  open_on: string | null;
  read_at: string | null;
  created_at: string;
  updated_at: string;
};

/** Columns the database fills in for us on insert. */
type Generated = 'id' | 'created_at' | 'updated_at';

type Insertable<Row, RequiredKeys extends keyof Row> = Pick<Row, RequiredKeys> &
  Partial<Omit<Row, RequiredKeys | Generated>>;

type Updatable<Row> = Partial<Omit<Row, Generated>>;

type TableDef<Row, RequiredKeys extends keyof Row> = {
  Row: Row;
  Insert: Insertable<Row, RequiredKeys>;
  Update: Updatable<Row>;
  Relationships: [];
}

export type Database = {
  public: {
    Tables: {
      couples: TableDef<CoupleRow, 'invite_code'>;
      profiles: TableDef<ProfileRow, 'id'>;
      memories: TableDef<MemoryRow, 'couple_id' | 'title' | 'date'>;
      // couple_id is absent from the required list on purpose: the trigger
      // fills it in, so it is optional on insert but always present on read.
      memory_photos: TableDef<MemoryPhotoRow, 'memory_id' | 'path'>;
      important_dates: TableDef<ImportantDateRow, 'couple_id' | 'label' | 'date'>;
      remember_facts: TableDef<RememberFactRow, 'couple_id' | 'author_id' | 'question'>;
      dismissed_questions: TableDef<
        DismissedQuestionRow,
        'couple_id' | 'author_id' | 'question_id'
      >;
      family_members: TableDef<FamilyMemberRow, 'couple_id' | 'name'>;
      phrases: TableDef<PhraseRow, 'couple_id' | 'script_original' | 'translation'>;
      culture_notes: TableDef<CultureNoteRow, 'couple_id' | 'title'>;
      trips: TableDef<TripRow, 'couple_id' | 'destination'>;
      // couple_id is absent from the required list on purpose: the database
      // trigger fills it in, so it is optional on insert but always present on read.
      trip_items: TableDef<TripItemRow, 'trip_id' | 'title'>;
      expenses: TableDef<ExpenseRow, 'couple_id' | 'paid_by' | 'label' | 'amount_cents'>;
      gift_ideas: TableDef<GiftIdeaRow, 'couple_id' | 'author_id' | 'idea'>;
      places: TableDef<PlaceRow, 'couple_id' | 'label' | 'latitude' | 'longitude'>;
      checkins: TableDef<CheckinRow, 'couple_id' | 'profile_id' | 'label'>;
      plans: TableDef<PlanRow, 'couple_id' | 'title' | 'day'>;
      intimacy_entries: TableDef<IntimacyEntryRow, 'couple_id' | 'date'>;
      flowers: TableDef<FlowerRow, 'couple_id' | 'from_profile' | 'to_profile' | 'kind'>;
      letters: TableDef<LetterRow, 'couple_id' | 'from_profile' | 'to_profile' | 'body'>;
      // couple_id is absent on purpose: the trigger fills it in.
      cycle_events: TableDef<CycleEventRow, 'profile_id' | 'started_on'>;
    };
    Views: { [_ in never]: never };
    Functions: {
      create_couple: {
        Args: {
          p_couple_name?: string | null;
          p_anniversary_date?: string | null;
          p_currency?: string;
        };
        Returns: CoupleRow;
      };
      join_couple: {
        Args: { p_invite_code: string };
        Returns: CoupleRow;
      };
      leave_couple: {
        Args: Record<PropertyKey, never>;
        Returns: void;
      };
      end_couple: {
        Args: Record<PropertyKey, never>;
        Returns: void;
      };
      reopen_couple: {
        Args: Record<PropertyKey, never>;
        Returns: void;
      };
      rotate_invite_code: {
        Args: Record<PropertyKey, never>;
        Returns: string;
      };
      current_couple_id: {
        Args: Record<PropertyKey, never>;
        Returns: string | null;
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
}

export type TableName = keyof Database['public']['Tables'];
export type RowOf<T extends TableName> = Database['public']['Tables'][T]['Row'];
export type InsertOf<T extends TableName> = Database['public']['Tables'][T]['Insert'];
export type UpdateOf<T extends TableName> = Database['public']['Tables'][T]['Update'];
