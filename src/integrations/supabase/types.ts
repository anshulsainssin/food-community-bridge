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
      donation_contacts: {
        Row: {
          contact_info: string
          donation_id: string
          updated_at: string
        }
        Insert: {
          contact_info: string
          donation_id: string
          updated_at?: string
        }
        Update: {
          contact_info?: string
          donation_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "donation_contacts_donation_id_fkey"
            columns: ["donation_id"]
            isOneToOne: true
            referencedRelation: "donations"
            referencedColumns: ["id"]
          },
        ]
      }
      donation_reports: {
        Row: {
          admin_note: string | null
          created_at: string
          details: string | null
          donation_id: string | null
          donation_label: string | null
          id: string
          reason: string
          reporter_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
        }
        Insert: {
          admin_note?: string | null
          created_at?: string
          details?: string | null
          donation_id?: string | null
          donation_label?: string | null
          id?: string
          reason: string
          reporter_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Update: {
          admin_note?: string | null
          created_at?: string
          details?: string | null
          donation_id?: string | null
          donation_label?: string | null
          id?: string
          reason?: string
          reporter_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "donation_reports_donation_id_fkey"
            columns: ["donation_id"]
            isOneToOne: false
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
          food_name: string | null
          packaging: string | null
          storage_condition: string | null
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
          food_name?: string | null
          packaging?: string | null
          storage_condition?: string | null
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
          food_name?: string | null
          packaging?: string | null
          storage_condition?: string | null
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
      ngo_registrations: {
        Row: {
          area_label: string | null
          contact_email: string | null
          contact_person: string
          contact_phone: string
          created_at: string
          id: string
          latitude: number | null
          longitude: number | null
          document_name: string | null
          document_path: string | null
          registration_number: string | null
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
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
          id?: string
          latitude?: number | null
          longitude?: number | null
          document_name?: string | null
          document_path?: string | null
          registration_number?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
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
          id?: string
          latitude?: number | null
          longitude?: number | null
          document_name?: string | null
          document_path?: string | null
          registration_number?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          organization_name?: string
          pincode?: string
          registration_80g?: string
          status?: string
          updated_at?: string
          user_id?: string
          verified_at?: string | null
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
      pickup_codes: {
        Row: {
          code: string
          created_at: string
          donation_id: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          code: string
          created_at?: string
          donation_id: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          donation_id?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pickup_codes_donation_id_fkey"
            columns: ["donation_id"]
            isOneToOne: true
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
      pickup_locations: {
        Row: {
          accuracy_m: number | null
          donation_id: string
          latitude: number
          longitude: number
          updated_at: string
          user_id: string
        }
        Insert: {
          accuracy_m?: number | null
          donation_id: string
          latitude: number
          longitude: number
          updated_at?: string
          user_id: string
        }
        Update: {
          accuracy_m?: number | null
          donation_id?: string
          latitude?: number
          longitude?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pickup_locations_donation_id_fkey"
            columns: ["donation_id"]
            isOneToOne: true
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
      user_roles: {
        Row: {
          created_at: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          role: string
          user_id: string
        }
        Update: {
          created_at?: string
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      user_suspensions: {
        Row: {
          reason: string | null
          suspended_at: string
          suspended_by: string | null
          user_id: string
        }
        Insert: {
          reason?: string | null
          suspended_at?: string
          suspended_by?: string | null
          user_id: string
        }
        Update: {
          reason?: string | null
          suspended_at?: string
          suspended_by?: string | null
          user_id?: string
        }
        Relationships: []
      }
      volunteer_verifications: {
        Row: {
          area: string
          contact_phone: string
          created_at: string
          document_name: string | null
          document_path: string | null
          full_name: string
          id_last4: string
          id_type: string
          pincode: string | null
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          area: string
          contact_phone: string
          created_at?: string
          document_name?: string | null
          document_path?: string | null
          full_name: string
          id_last4: string
          id_type: string
          pincode?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          area?: string
          contact_phone?: string
          created_at?: string
          document_name?: string | null
          document_path?: string | null
          full_name?: string
          id_last4?: string
          id_type?: string
          pincode?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_list_users: {
        Args: { p_search?: string }
        Returns: {
          created_at: string
          donations_posted: number
          email: string
          full_name: string
          id: string
          is_admin: boolean
          ngo_status: string
          organization: string
          phone: string
          pickups_claimed: number
          role: string
          suspended: boolean
          suspension_reason: string
          volunteer_status: string
        }[]
      }
      admin_overview: {
        Args: never
        Returns: {
          admins: number
          donations_available: number
          donations_claimed: number
          donations_completed: number
          donations_expired: number
          donations_in_pickup: number
          donations_picked_up: number
          donations_total: number
          donors: number
          food_donated_kg: number
          food_saved_kg: number
          ngo_accounts: number
          ngo_pending: number
          ngo_rejected: number
          ngo_verified: number
          open_reports: number
          people_fed: number
          suspended: number
          total_users: number
          volunteer_accounts: number
          volunteer_pending: number
          volunteer_rejected: number
          volunteer_verified: number
        }[]
      }
      admin_remove_donation: {
        Args: { p_donation_id: string; p_reason: string }
        Returns: undefined
      }
      admin_review_report: {
        Args: { p_note?: string; p_report_id: string; p_status: string }
        Returns: Database["public"]["Tables"]["donation_reports"]["Row"]
      }
      admin_set_admin: {
        Args: { p_make_admin: boolean; p_user_id: string }
        Returns: undefined
      }
      admin_set_ngo_status: {
        Args: { p_reason?: string; p_registration_id: string; p_status: string }
        Returns: Database["public"]["Tables"]["ngo_registrations"]["Row"]
      }
      admin_set_suspension: {
        Args: { p_reason?: string; p_suspend: boolean; p_user_id: string }
        Returns: undefined
      }
      admin_set_user_role: {
        Args: { p_role: string; p_user_id: string }
        Returns: undefined
      }
      admin_set_volunteer_status: {
        Args: { p_reason?: string; p_status: string; p_user_id: string }
        Returns: Database["public"]["Tables"]["volunteer_verifications"]["Row"]
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
          food_name: string | null
          packaging: string | null
          storage_condition: string | null
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
          food_name: string | null
          packaging: string | null
          storage_condition: string | null
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
          pickup_to_receiver_km: number
          receiver_name: string
          receiver_organization: string
          receiver_phone: string
        }[]
      }
      expire_old_donations: { Args: never; Returns: number }
      get_pickup_code: {
        Args: { p_donation_id: string }
        Returns: {
          code: string
          verified_at: string
        }[]
      }
      is_platform_admin: { Args: never; Returns: boolean }
      is_user_suspended: { Args: { p_user: string }; Returns: boolean }
      is_verified_receiver: { Args: { p_user: string }; Returns: boolean }
      leaderboard: {
        Args: never
        Returns: {
          board: string
          completed: number
          display_name: string
          food_kg: number
          is_me: boolean
          people_served: number
          rank: number
        }[]
      }
      my_badges: {
        Args: never
        Returns: {
          badge: string
          detail: string
        }[]
      }
      is_pickup_party: { Args: { p_donation_id: string }; Returns: boolean }
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
          active_donations: number
          claimed_donations: number
          donations_completed: number
          food_saved_kg: number
          on_time_pickups: number
          people_fed: number
          pickups_completed: number
          total_donations: number
        }[]
      }
      new_pickup_code: { Args: never; Returns: string }
      ngo_admin_stats: {
        Args: never
        Returns: {
          active_distributions: number
          delivered: number
          food_claimed_kg: number
          meals_claimed: number
          open_requests: number
          pending_pickups: number
          people_served: number
          total_claims: number
        }[]
      }
      platform_impact_stats: {
        Args: never
        Returns: {
          active_volunteers: number
          completed_pickups: number
          food_donated_kg: number
          food_saved_kg: number
          verified_ngos: number
          waste_reduced_kg: number
        }[]
      }
      share_pickup_location: {
        Args: {
          p_accuracy_m?: number
          p_donation_id: string
          p_latitude: number
          p_longitude: number
        }
        Returns: {
          accuracy_m: number | null
          donation_id: string
          latitude: number
          longitude: number
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "pickup_locations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      stop_pickup_location: { Args: { p_donation_id: string }; Returns: undefined }
      verify_pickup_code: {
        Args: { p_code: string; p_donation_id: string }
        Returns: {
          claimed_at: string | null
          claimed_by: string | null
          completed_at: string | null
          contact_info: string | null
          created_at: string
          diet: string
          donor_id: string
          food_name: string | null
          packaging: string | null
          storage_condition: string | null
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
