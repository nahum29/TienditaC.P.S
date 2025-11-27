export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string | null;
          email: string | null;
          role: string;
          created_at: string;
        };
        Insert: {
          id: string;
          full_name?: string | null;
          email?: string | null;
          role?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string | null;
          email?: string | null;
          role?: string;
          created_at?: string;
        };
      };
      categories: {
        Row: {
          id: string;
          name: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          created_at?: string;
        };
      };
      products: {
        Row: {
          id: string;
          sku: string | null;
          name: string;
          description: string | null;
          price: number;
          cost: number | null;
          stock: number;
          low_stock_threshold: number | null;
          category_id: string | null;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          sku?: string | null;
          name: string;
          description?: string | null;
          price: number;
          cost?: number | null;
          stock?: number;
          low_stock_threshold?: number | null;
          category_id?: string | null;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          sku?: string | null;
          name?: string;
          description?: string | null;
          price?: number;
          cost?: number | null;
          stock?: number;
          low_stock_threshold?: number | null;
          category_id?: string | null;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      customers: {
        Row: {
          id: string;
          name: string;
          phone: string | null;
          email: string | null;
          address: string | null;
          balance: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          phone?: string | null;
          email?: string | null;
          address?: string | null;
          balance?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          phone?: string | null;
          email?: string | null;
          address?: string | null;
          balance?: number;
          created_at?: string;
        };
      };
      sales: {
        Row: {
          id: string;
          customer_id: string | null;
          total_amount: number;
          total_cost: number | null;
          status: string;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          customer_id?: string | null;
          total_amount: number;
          total_cost?: number | null;
          status: string;
          created_by: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          customer_id?: string | null;
          total_amount?: number;
          total_cost?: number | null;
          status?: string;
          created_by?: string;
          created_at?: string;
        };
      };
      sale_items: {
        Row: {
          id: string;
          sale_id: string;
          product_id: string;
          quantity: number;
          unit_price: number;
          total_price: number;
        };
        Insert: {
          id?: string;
          sale_id: string;
          product_id: string;
          quantity: number;
          unit_price: number;
          total_price: number;
        };
        Update: {
          id?: string;
          sale_id?: string;
          product_id?: string;
          quantity?: number;
          unit_price?: number;
          total_price?: number;
        };
      };
      payments: {
        Row: {
          id: string;
          sale_id: string | null;
          customer_id: string | null;
          amount: number;
          method: string;
          received_by: string;
          created_at: string;
          notes: string | null;
        };
        Insert: {
          id?: string;
          sale_id?: string | null;
          customer_id?: string | null;
          amount: number;
          method: string;
          received_by: string;
          created_at?: string;
          notes?: string | null;
        };
        Update: {
          id?: string;
          sale_id?: string | null;
          customer_id?: string | null;
          amount?: number;
          method?: string;
          received_by?: string;
          created_at?: string;
          notes?: string | null;
        };
      };
      credits: {
        Row: {
          id: string;
          sale_id: string | null;
          customer_id: string;
          total_amount: number;
          outstanding_amount: number;
          due_date: string | null;
          status: string;
          created_at: string;
          week_start: string | null;
          week_end: string | null;
        };
        Insert: {
          id?: string;
          sale_id?: string | null;
          customer_id: string;
          total_amount: number;
          outstanding_amount: number;
          due_date?: string | null;
          status: string;
          created_at?: string;
          week_start?: string | null;
          week_end?: string | null;
        };
        Update: {
          id?: string;
          sale_id?: string | null;
          customer_id?: string;
          total_amount?: number;
          outstanding_amount?: number;
          due_date?: string | null;
          status?: string;
          created_at?: string;
          week_start?: string | null;
          week_end?: string | null;
        };
      };
    };
    Views: {};
    Functions: {};
    Enums: {};
    CompositeTypes: {};
  };
}
