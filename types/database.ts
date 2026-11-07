/**
 * Supabase Database type map — aligned with supabase/migrations/.
 * Regenerate via: npx supabase gen types typescript --local > types/database.ts
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      webhook_events: {
        Row: {
          id: string;
          shopify_webhook_id: string;
          topic: string;
          shopify_order_id: number | null;
          processed_at: string;
        };
        Insert: {
          id?: string;
          shopify_webhook_id: string;
          topic: string;
          shopify_order_id?: number | null;
          processed_at?: string;
        };
        Update: {
          id?: string;
          shopify_webhook_id?: string;
          topic?: string;
          shopify_order_id?: number | null;
          processed_at?: string;
        };
        Relationships: [];
      };
      orders: {
        Row: {
          id: string;
          shopify_order_id: number;
          order_number: string;
          currency: Database["public"]["Enums"]["currency_code"];
          total_price: number;
          fulfillment_status: Database["public"]["Enums"]["fulfillment_status"];
          shipping_address: Json;
          customer_email: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          shopify_order_id: number;
          order_number: string;
          currency?: Database["public"]["Enums"]["currency_code"];
          total_price: number;
          fulfillment_status?: Database["public"]["Enums"]["fulfillment_status"];
          shipping_address?: Json;
          customer_email?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          shopify_order_id?: number;
          order_number?: string;
          currency?: Database["public"]["Enums"]["currency_code"];
          total_price?: number;
          fulfillment_status?: Database["public"]["Enums"]["fulfillment_status"];
          shipping_address?: Json;
          customer_email?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      order_items: {
        Row: {
          id: string;
          order_id: string;
          sku: string;
          quantity: number;
          unit_price: number;
          product_title: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          sku: string;
          quantity: number;
          unit_price: number;
          product_title: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          order_id?: string;
          sku?: string;
          quantity?: number;
          unit_price?: number;
          product_title?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
        ];
      };
      inventory: {
        Row: {
          sku: string;
          product_name: string;
          local_stock: number;
          supplier_stock: number;
          reserved_stock: number;
          low_stock_threshold: number;
          unit_supplier_cost: number;
          updated_at: string;
        };
        Insert: {
          sku: string;
          product_name: string;
          local_stock?: number;
          supplier_stock?: number;
          reserved_stock?: number;
          low_stock_threshold?: number;
          unit_supplier_cost?: number;
          updated_at?: string;
        };
        Update: {
          sku?: string;
          product_name?: string;
          local_stock?: number;
          supplier_stock?: number;
          reserved_stock?: number;
          low_stock_threshold?: number;
          unit_supplier_cost?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      fulfillments: {
        Row: {
          id: string;
          order_id: string;
          tracking_number: string;
          carrier: string;
          synced_to_shopify: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          tracking_number: string;
          carrier?: string;
          synced_to_shopify?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          order_id?: string;
          tracking_number?: string;
          carrier?: string;
          synced_to_shopify?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "fulfillments_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
        ];
      };
      financial_logs: {
        Row: {
          id: string;
          order_id: string;
          gross_amount: number;
          supplier_cost: number;
          platform_fee: number;
          net_profit: number;
          exchange_rate: number;
          base_currency: Database["public"]["Enums"]["currency_code"];
          created_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          gross_amount: number;
          supplier_cost?: number;
          platform_fee?: number;
          net_profit: number;
          exchange_rate?: number;
          base_currency?: Database["public"]["Enums"]["currency_code"];
          created_at?: string;
        };
        Update: {
          id?: string;
          order_id?: string;
          gross_amount?: number;
          supplier_cost?: number;
          platform_fee?: number;
          net_profit?: number;
          exchange_rate?: number;
          base_currency?: Database["public"]["Enums"]["currency_code"];
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "financial_logs_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      v_inventory_alerts: {
        Row: {
          sku: string | null;
          product_name: string | null;
          available_stock: number | null;
          threshold: number | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      reserve_inventory: {
        Args: { p_sku: string; p_quantity: number };
        Returns: Database["public"]["Tables"]["inventory"]["Row"];
      };
      fulfill_inventory_deduction: {
        Args: { p_sku: string; p_quantity: number };
        Returns: Database["public"]["Tables"]["inventory"]["Row"];
      };
      release_inventory_reservation: {
        Args: { p_sku: string; p_quantity: number };
        Returns: Database["public"]["Tables"]["inventory"]["Row"];
      };
    };
    Enums: {
      fulfillment_status:
        | "pending"
        | "processing"
        | "shipped"
        | "delivered"
        | "cancelled"
        | "failed";
      currency_code: "USD" | "EUR" | "GBP" | "CAD" | "AUD" | "CNY";
    };
    CompositeTypes: Record<string, never>;
  };
};

/** Convenience row type aliases */
export type OrderRow = Database["public"]["Tables"]["orders"]["Row"];
export type OrderItemRow = Database["public"]["Tables"]["order_items"]["Row"];
export type InventoryRow = Database["public"]["Tables"]["inventory"]["Row"];
export type FulfillmentRow = Database["public"]["Tables"]["fulfillments"]["Row"];
export type FinancialLogRow =
  Database["public"]["Tables"]["financial_logs"]["Row"];
export type WebhookEventRow =
  Database["public"]["Tables"]["webhook_events"]["Row"];
