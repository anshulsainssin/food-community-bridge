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
      admins: {
        Row: {
          created_at: string
          id: string
        }
        Insert: {
          created_at?: string
          id: string
        }
        Update: {
          created_at?: string
          id?: string
        }
        Relationships: []
      }
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
      contact_messages: {
        Row: {
          created_at: string
          email: string
          id: string
          message: string
          name: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          message: string
          name: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          message?: string
          name?: string
        }
        Relationships: []
      }
      distribution_centers: {
        Row: {
          active: boolean
          address: string | null
          center_type: string
          created_at: string
          daily_meal_target: number
          id: string
          latitude: number | null
          longitude: number | null
          name: string
        }
        Insert: {
          active?: boolean
          address?: string | null
          center_type?: string
          created_at?: string
          daily_meal_target?: number
          id?: string
          latitude?: number | null
          longitude?: number | null
          name: string
        }
        Update: {
          active?: boolean
          address?: string | null
          center_type?: string
          created_at?: string
          daily_meal_target?: number
          id?: string
          latitude?: number | null
          longitude?: number | null
          name?: string
        }
        Relationships: []
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
          photo_url: string | null
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
          photo_url?: string | null
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
          photo_url?: string | null
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
      kitchen_inventory: {
        Row: {
          category: string
          current_stock: number
          id: string
          item_name: string
          reorder_threshold: number
          unit: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          category: string
          current_stock?: number
          id?: string
          item_name: string
          reorder_threshold?: number
          unit?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          category?: string
          current_stock?: number
          id?: string
          item_name?: string
          reorder_threshold?: number
          unit?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      meal_logs: {
        Row: {
          center_id: string
          children_served: number
          created_at: string
          id: string
          log_date: string
          logged_by: string | null
          meals_cooked: number
        }
        Insert: {
          center_id: string
          children_served?: number
          created_at?: string
          id?: string
          log_date?: string
          logged_by?: string | null
          meals_cooked?: number
        }
        Update: {
          center_id?: string
          children_served?: number
          created_at?: string
          id?: string
          log_date?: string
          logged_by?: string | null
          meals_cooked?: number
        }
        Relationships: [
          {
            foreignKeyName: "meal_logs_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "distribution_centers"
            referencedColumns: ["id"]
          },
        ]
      }
      ngo_registrations: {
        Row: {
          area_label: string | null
          contact_email: string | null
          contact_person: string
          contact_phone: string
          created_at: string
          distribution_center_id: string | null
          id: string
          latitude: number | null
          longitude: number | null
          organization_name: string
          pincode: string
          registration_80g: string
          status: string
          updated_at: string
          user_id: string
          verified_at: string | null
        }
        Insert: {
          area_label?: string | null
          contact_email?: string | null
          contact_person: string
          contact_phone: string
          created_at?: string
          distribution_center_id?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          organization_name: string
          pincode: string
          registration_80g: string
          status?: string
          updated_at?: string
          user_id: string
          verified_at?: string | null
        }
        Update: {
          area_label?: string | null
          contact_email?: string | null
          contact_person?: string
          contact_phone?: string
          created_at?: string
          distribution_center_id?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          organization_name?: string
          pincode?: string
          registration_80g?: string
          status?: string
          updated_at?: string
          user_id?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ngo_registrations_distribution_center_id_fkey"
            columns: ["distribution_center_id"]
            isOneToOne: false
            referencedRelation: "distribution_centers"
            referencedColumns: ["id"]
          },
        ]
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
      sponsorships: {
        Row: {
          amount_inr: number
          created_at: string
          id: string
          meals_sponsored: number
          message: string | null
          sponsor_email: string | null
          sponsor_id: string | null
          sponsor_name: string
        }
        Insert: {
          amount_inr: number
          created_at?: string
          id?: string
          meals_sponsored: number
          message?: string | null
          sponsor_email?: string | null
          sponsor_id?: string | null
          sponsor_name: string
        }
        Update: {
          amount_inr?: number
          created_at?: string
          id?: string
          meals_sponsored?: number
          message?: string | null
          sponsor_email?: string | null
          sponsor_id?: string | null
          sponsor_name?: string
        }
        Relationships: []
      }
      volunteer_signups: {
        Row: {
          created_at: string
          email: string
          id: string
          location_label: string | null
          message: string | null
          name: string
          phone: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          location_label?: string | null
          message?: string | null
          name: string
          phone?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          location_label?: string | null
          message?: string | null
          name?: string
          phone?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_dashboard_stats: {
        Args: never
        Returns: {
          active_requests: number
          expired_donations: number
          food_saved_kg: number
          meals_delivered: number
          pending_contact_messages: number
          pending_volunteer_signups: number
          total_donations: number
          total_users: number
        }[]
      }
      admin_list_contact_messages: {
        Args: never
        Returns: {
          created_at: string
          email: string
          id: string
          message: string
          name: string
        }[]
        SetofOptions: {
          from: "*"
          to: "contact_messages"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      admin_list_donations: {
        Args: never
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
          photo_url: string | null
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
        }[]
        SetofOptions: {
          from: "*"
          to: "donations"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      admin_list_profiles: {
        Args: never
        Returns: {
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
        }[]
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      admin_list_volunteer_signups: {
        Args: never
        Returns: {
          created_at: string
          email: string
          id: string
          location_label: string | null
          message: string | null
          name: string
          phone: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "volunteer_signups"
          isOneToOne: false
          isSetofReturn: true
        }
      }
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
          photo_url: string | null
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
          photo_url: string | null
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
      expire_old_donations: { Args: never; Returns: number }
      kitchen_dashboard_stats: {
        Args: never
        Returns: {
          active_kitchen_centers: number
          children_served_today: number
          low_stock_items: number
          meals_cooked_this_month: number
          meals_cooked_today: number
          total_meals_sponsored: number
          total_sponsorships_amount: number
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
      nearby_urgent_ngos: {
        Args: { p_lat: number; p_lon: number; p_radius_km?: number }
        Returns: {
          active_claims: number
          distance_km: number
          full_name: string
          id: string
          latitude: number
          location_label: string
          longitude: number
          organization: string
          role: string
          urgent_claims: number
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
