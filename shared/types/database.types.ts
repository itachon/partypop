// Tipos de la base de datos.
// Escritos a mano para arrancar; cuando tengas el proyecto Supabase
// vinculado, regenéralos con:  npm run db:types

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string
          full_name: string | null
          created_at: string
        }
        Insert: {
          id: string
          email: string
          full_name?: string | null
          created_at?: string
        }
        Update: {
          full_name?: string | null
        }
        Relationships: []
      }
      parties: {
        Row: {
          id: string
          owner_id: string
          name: string
          description: string | null
          location: string | null
          event_at: string
          rsvp_deadline: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          owner_id?: string
          name: string
          description?: string | null
          location?: string | null
          event_at: string
          rsvp_deadline: string
        }
        Update: {
          name?: string
          description?: string | null
          location?: string | null
          event_at?: string
          rsvp_deadline?: string
        }
        Relationships: [
          {
            foreignKeyName: 'parties_owner_id_fkey'
            columns: ['owner_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      party_admins: {
        Row: {
          party_id: string
          user_id: string
          created_at: string
        }
        Insert: {
          party_id: string
          user_id: string
          created_at?: string
        }
        Update: Record<string, never>
        Relationships: [
          {
            foreignKeyName: 'party_admins_party_id_fkey'
            columns: ['party_id']
            isOneToOne: false
            referencedRelation: 'parties'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'party_admins_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      invitations: {
        Row: {
          id: string
          party_id: string
          guest_name: string
          max_guests: number
          token: string
          status: Database['public']['Enums']['invitation_status']
          confirmed_guests: number | null
          responded_at: string | null
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          party_id: string
          guest_name: string
          max_guests?: number
          notes?: string | null
        }
        Update: {
          guest_name?: string
          max_guests?: number
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'invitations_party_id_fkey'
            columns: ['party_id']
            isOneToOne: false
            referencedRelation: 'parties'
            referencedColumns: ['id']
          },
        ]
      }
      gifts: {
        Row: {
          id: string
          party_id: string
          name: string
          description: string | null
          photo_path: string | null
          purchase_url: string | null
          sort_order: number
          created_at: string
          updated_at: string
        }
        Insert: {
          party_id: string
          name: string
          description?: string | null
          photo_path?: string | null
          purchase_url?: string | null
          sort_order?: number
        }
        Update: {
          name?: string
          description?: string | null
          photo_path?: string | null
          purchase_url?: string | null
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: 'gifts_party_id_fkey'
            columns: ['party_id']
            isOneToOne: false
            referencedRelation: 'parties'
            referencedColumns: ['id']
          },
        ]
      }
      gift_reservations: {
        Row: {
          gift_id: string
          invitation_id: string
          party_id: string
          created_at: string
        }
        Insert: Record<string, never>
        Update: Record<string, never>
        Relationships: [
          {
            foreignKeyName: 'gift_reservations_gift_id_party_id_fkey'
            columns: ['gift_id', 'party_id']
            isOneToOne: true
            referencedRelation: 'gifts'
            referencedColumns: ['id', 'party_id']
          },
          {
            foreignKeyName: 'gift_reservations_invitation_id_party_id_fkey'
            columns: ['invitation_id', 'party_id']
            isOneToOne: true
            referencedRelation: 'invitations'
            referencedColumns: ['id', 'party_id']
          },
        ]
      }
    }
    Views: Record<string, never>
    Functions: {
      is_party_owner: { Args: { p_party_id: string }, Returns: boolean }
      is_party_admin: { Args: { p_party_id: string }, Returns: boolean }
      add_party_admin: { Args: { p_party_id: string, p_email: string }, Returns: string }
      regenerate_invitation_token: { Args: { p_invitation_id: string }, Returns: string }
      guest_get_invitation: { Args: { p_token: string }, Returns: Json }
      guest_respond: {
        Args: {
          p_token: string
          p_status: Database['public']['Enums']['invitation_status']
          p_confirmed_guests?: number | null
        }
        Returns: Json
      }
      guest_list_gifts: { Args: { p_token: string }, Returns: Json }
      guest_reserve_gift: { Args: { p_token: string, p_gift_id: string }, Returns: Json }
      guest_release_gift: { Args: { p_token: string }, Returns: Json }
    }
    Enums: {
      invitation_status: 'pending' | 'accepted' | 'declined'
    }
    CompositeTypes: Record<string, never>
  }
}

type PublicSchema = Database['public']
export type Tables<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Row']
export type Enums<T extends keyof PublicSchema['Enums']> = PublicSchema['Enums'][T]
