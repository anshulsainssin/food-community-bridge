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
      claims: {
        Row: {
          created_at: string
          donation_id: string
          id: string
          receiver_id: string
        }
        Insert: {
          created_at?: string
          donation_id: string
          id?: string
          receiver_id: string
        }
        Update: {
          created_at?: string
          donation_id?: string
          id?: string
          receiver_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "claims_donation_id_fkey"
            columns: ["donation_id"]
            isOneToOne: true
            referencedRelation: "donations"
            referencedColumns: ["id"]
          },
        ]
      }
      donations: {
        Row: {
          claimed_at: string | null
          claimed_by: string | null
          completed_at: string | null
          contact_info: string | null
          created_at: string
          diet: string
          donor_id: string
          food_type: string
          id: string
          notes: string | null
          pickup_address: string
          pickup_deadline: string | null
          pickup_latitude: number | null
          pickup_longitude: number | null
          prepared_at: string | null
          quantity: string
          servings: number | null
          status: string
          updated_at: string
          weight_kg: number | null
        }
        Insert: {
          claimed_at?: string | null
          claimed_by?: string | null
          completed_at?: string | null
          contact_info?: string | null
          created_at?: string
          diet: string
          donor_id: string
          food_type: string
          id?: string
          notes?: string | null
          pickup_address: string
          pickup_deadline?: string | null
          pickup_latitude?: number | null
          pickup_longitude?: number | null
          prepared_at?: string | null
          quantity: string
          servings?: number | null
          status?: string
          updated_at?: string
          weight_kg?: number | null
        }
        Update: {
          claimed_at?: string | null
          claimed_by?: string | null
          completed_at?: string | null
          contact_info?: string | null
          created_at?: string
          diet?: string
          donor_id?: string
          food_type?: string
          id?: string
          notes?: string | null
          pickup_address?: string
          pickup_deadline?: string | null
          pickup_latitude?: number | null
          pickup_longitude?: number | null
          prepared_at?: string | null
          quantity?: string
          servings?: number | null
          status?: string
          updated_at?: string
          weight_kg?: number | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          donation_id: string | null
          id: string
          read: boolean
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          donation_id?: string | null
          id?: string
          read?: boolean
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          donation_id?: string | null
          id?: string
          read?: boolean
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_donation_id_fkey"
            columns: ["donation_id"]
            isOneToOne: false
            referencedRelation: "donations"
            referencedColumns: ["id"]
          },
        ]
      }
      pickup_events: {
        Row: {
          actor_id: string | null
          donation_id: string
          id: string
          occurred_at: string
          status: string
        }
        Insert: {
          actor_id?: string | null
          donation_id: string
          id?: string
          occurred_at?: string
          status: string
        }
        Update: {
          actor_id?: string | null
          donation_id?: string
          id?: string
          occurred_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "pickup_events_donation_id_fkey"
            columns: ["donation_id"]
            isOneToOne: false
            referencedRelation: "donations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          latitude: number | null
          location_label: string | null
          longitude: number | null
          organization: string | null
          phone: string | null
          role: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          latitude?: number | null
          location_label?: string | null
          longitude?: number | null
          organization?: string | null
          phone?: string | null
          role?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          latitude?: number | null
          location_label?: string | null
          longitude?: number | null
          organization?: string | null
          phone?: string | null
          role?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      advance_donation_status: {
        Args: { p_donation_id: string; p_status: string }
        Returns: {
          claimed_at: string | null
          claimed_by: string | null
          completed_at: string | null
          contact_info: string | null
          created_at: string
          diet: string
          donor_id: string
          food_type: string
          id: string
          notes: string | null
          pickup_address: string
          pickup_deadline: string | null
          pickup_latitude: number | null
          pickup_longitude: number | null
          prepared_at: string | null
          quantity: string
          servings: number | null
          status: string
          updated_at: string
          weight_kg: number | null
        }
        SetofOptions: {
          from: "*"
          to: "donations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      claim_donation: {
        Args: { p_donation_id: string }
        Returns: {
          claimed_at: string | null
          claimed_by: string | null
          completed_at: string | null
          contact_info: string | null
          created_at: string
          diet: string
          donor_id: string
          food_type: string
          id: string
          notes: string | null
          pickup_address: string
          pickup_deadline: string | null
          pickup_latitude: number | null
          pickup_longitude: number | null
          prepared_at: string | null
          quantity: string
          servings: number | null
          status: string
          updated_at: string
          weight_kg: number | null
        }
        SetofOptions: {
          from: "*"
          to: "donations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      donation_parties: {
        Args: { p_donation_id: string }
        Returns: {
          donor_name: string
          donor_organization: string
          donor_phone: string
          receiver_name: string
          receiver_organization: string
          receiver_phone: string
        }[]
      }
      my_dashboard_stats: {
        Args: never
        Returns: {
          active_donations: number
          completed_pickups: number
          food_saved_kg: number
          meals_this_month: number
          people_fed: number
        }[]
      }
      network_impact_stats: {
        Args: never
        Returns: {
          claimed_donations: number
          donations_completed: number
          food_saved_kg: number
          on_time_pickups: number
          people_fed: number
          pickups_completed: number
          total_donations: number
        }[]
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
