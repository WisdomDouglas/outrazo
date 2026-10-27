export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      event_attendees: {
        Row: {
          created_at: string
          event_id: string
          id: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_attendees_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_attendees_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          address: string | null
          attendee_count: number
          category: string
          city: string | null
          created_at: string
          created_by: string | null
          currency: string
          description: string | null
          event_type: string
          ends_at: string | null
          id: string
          image_url: string | null
          capacity: number
          latitude: number | null
          longitude: number | null
          organizer_id: string
          price_from: number | null
          published: boolean
          slug: string
          starts_at: string
          status: string
          summary: string | null
          title: string
          venue_name: string | null
        }
        Insert: {
          address?: string | null
          attendee_count?: number
          category?: string
          city?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          event_type?: string
          ends_at?: string | null
          id?: string
          image_url?: string | null
          capacity?: number
          latitude?: number | null
          longitude?: number | null
          organizer_id: string
          price_from?: number | null
          published?: boolean
          slug: string
          starts_at: string
          status?: string
          summary?: string | null
          title: string
          venue_name?: string | null
        }
        Update: {
          address?: string | null
          attendee_count?: number
          category?: string
          city?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          event_type?: string
          ends_at?: string | null
          id?: string
          image_url?: string | null
          capacity?: number
          latitude?: number | null
          longitude?: number | null
          organizer_id?: string
          price_from?: number | null
          published?: boolean
          slug?: string
          starts_at?: string
          status?: string
          summary?: string | null
          title?: string
          venue_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_organizer_id_fkey"
            columns: ["organizer_id"]
            isOneToOne: false
            referencedRelation: "organizers"
            referencedColumns: ["id"]
          },
        ]
      }
      event_ticket_tiers: {
        Row: {
          created_at: string
          event_id: string
          id: string
          name: string
          price: number
          quantity: number
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          name: string
          price: number
          quantity: number
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          name?: string
          price?: number
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "event_ticket_tiers_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      organizers: {
        Row: {
          avatar_url: string | null
          community: string | null
          created_at: string
          description: string | null
          id: string
          location: string | null
          name: string
          owner_id: string | null
          slug: string
          social_links: Json
          verified: boolean
          website: string | null
        }
        Insert: {
          avatar_url?: string | null
          community?: string | null
          created_at?: string
          description?: string | null
          id?: string
          location?: string | null
          name: string
          owner_id?: string | null
          slug: string
          social_links?: Json
          verified?: boolean
          website?: string | null
        }
        Update: {
          avatar_url?: string | null
          community?: string | null
          created_at?: string
          description?: string | null
          id?: string
          location?: string | null
          name?: string
          owner_id?: string | null
          slug?: string
          social_links?: Json
          verified?: boolean
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organizers_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          id: string
          location: string | null
          name: string | null
          onboarding_completed: boolean
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          id: string
          location?: string | null
          name?: string | null
          onboarding_completed?: boolean
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          id?: string
          location?: string | null
          name?: string | null
          onboarding_completed?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      saved_events: {
        Row: {
          created_at: string
          event_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_events_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_items: {
        Row: {
          created_at: string
          id: string
          order_id: string
          quantity: number
          tier_id: string | null
          tier_name: string
          unit_price: number
        }
        Insert: {
          created_at?: string
          id?: string
          order_id: string
          quantity?: number
          tier_id?: string | null
          tier_name: string
          unit_price?: number
        }
        Update: {
          created_at?: string
          id?: string
          order_id?: string
          quantity?: number
          tier_id?: string | null
          tier_name?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "ticket_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "ticket_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_orders: {
        Row: {
          created_at: string
          currency: string
          event_id: string
          id: string
          reference: string
          status: string
          total_amount: number
          user_id: string
        }
        Insert: {
          created_at?: string
          currency?: string
          event_id: string
          id?: string
          reference?: string
          status?: string
          total_amount?: number
          user_id: string
        }
        Update: {
          created_at?: string
          currency?: string
          event_id?: string
          id?: string
          reference?: string
          status?: string
          total_amount?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_orders_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_orders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      replace_event_ticket_tiers_v1: {
        Args: {
          p_event_id: string
          p_tiers: Json
        }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
