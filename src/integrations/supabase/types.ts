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
      acessos_portais: {
        Row: {
          atualizado_por: string | null
          company_id: string
          contact_id: string
          created_at: string
          id: string
          login: string | null
          observacao: string | null
          portal: Database["public"]["Enums"]["portal_tipo"]
          portal_label: string | null
          senha_encrypted: string | null
          updated_at: string
          validade_certificado: string | null
        }
        Insert: {
          atualizado_por?: string | null
          company_id: string
          contact_id: string
          created_at?: string
          id?: string
          login?: string | null
          observacao?: string | null
          portal: Database["public"]["Enums"]["portal_tipo"]
          portal_label?: string | null
          senha_encrypted?: string | null
          updated_at?: string
          validade_certificado?: string | null
        }
        Update: {
          atualizado_por?: string | null
          company_id?: string
          contact_id?: string
          created_at?: string
          id?: string
          login?: string | null
          observacao?: string | null
          portal?: Database["public"]["Enums"]["portal_tipo"]
          portal_label?: string | null
          senha_encrypted?: string | null
          updated_at?: string
          validade_certificado?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "acessos_portais_atualizado_por_fkey"
            columns: ["atualizado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acessos_portais_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acessos_portais_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acessos_portais_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "vw_cofre_global"
            referencedColumns: ["contact_id"]
          },
        ]
      }
      active_sessions: {
        Row: {
          id: string
          last_seen_at: string | null
          metadata: Json | null
          session_uuid: string
          started_at: string | null
          user_id: string | null
        }
        Insert: {
          id?: string
          last_seen_at?: string | null
          metadata?: Json | null
          session_uuid: string
          started_at?: string | null
          user_id?: string | null
        }
        Update: {
          id?: string
          last_seen_at?: string | null
          metadata?: Json | null
          session_uuid?: string
          started_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      banks: {
        Row: {
          account_number: string | null
          agency: string | null
          bank_code: string | null
          color: string | null
          company_id: string
          created_at: string
          current_balance: number
          id: string
          initial_balance: number
          is_active: boolean
          is_invisible: boolean | null
          name: string
          updated_at: string
        }
        Insert: {
          account_number?: string | null
          agency?: string | null
          bank_code?: string | null
          color?: string | null
          company_id: string
          created_at?: string
          current_balance?: number
          id?: string
          initial_balance?: number
          is_active?: boolean
          is_invisible?: boolean | null
          name: string
          updated_at?: string
        }
        Update: {
          account_number?: string | null
          agency?: string | null
          bank_code?: string | null
          color?: string | null
          company_id?: string
          created_at?: string
          current_balance?: number
          id?: string
          initial_balance?: number
          is_active?: boolean
          is_invisible?: boolean | null
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "banks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      boleto_controls: {
        Row: {
          canal_entrega: string | null
          codigo_barras: string | null
          company_id: string
          contact_id: string
          created_at: string
          data_pagamento: string | null
          data_vencimento: string | null
          entregue_em: string | null
          generated_at: string | null
          id: string
          linha_digitavel: string | null
          nosso_numero: number | null
          origem_baixa: string | null
          reference_month: string
          seu_numero: string | null
          sicoob_response: Json | null
          status: string
          updated_at: string
          url_qrcode: string | null
          valor: number | null
          valor_pago: number | null
        }
        Insert: {
          canal_entrega?: string | null
          codigo_barras?: string | null
          company_id: string
          contact_id: string
          created_at?: string
          data_pagamento?: string | null
          data_vencimento?: string | null
          entregue_em?: string | null
          generated_at?: string | null
          id?: string
          linha_digitavel?: string | null
          nosso_numero?: number | null
          origem_baixa?: string | null
          reference_month: string
          seu_numero?: string | null
          sicoob_response?: Json | null
          status?: string
          updated_at?: string
          url_qrcode?: string | null
          valor?: number | null
          valor_pago?: number | null
        }
        Update: {
          canal_entrega?: string | null
          codigo_barras?: string | null
          company_id?: string
          contact_id?: string
          created_at?: string
          data_pagamento?: string | null
          data_vencimento?: string | null
          entregue_em?: string | null
          generated_at?: string | null
          id?: string
          linha_digitavel?: string | null
          nosso_numero?: number | null
          origem_baixa?: string | null
          reference_month?: string
          seu_numero?: string | null
          sicoob_response?: Json | null
          status?: string
          updated_at?: string
          url_qrcode?: string | null
          valor?: number | null
          valor_pago?: number | null
        }
        Relationships: []
      }
      categories: {
        Row: {
          color: string | null
          company_id: string
          created_at: string
          icon: string | null
          id: string
          name: string
          parent_id: string | null
          show_in_dre: boolean
          type: string
          updated_at: string
        }
        Insert: {
          color?: string | null
          company_id: string
          created_at?: string
          icon?: string | null
          id?: string
          name: string
          parent_id?: string | null
          show_in_dre?: boolean
          type: string
          updated_at?: string
        }
        Update: {
          color?: string | null
          company_id?: string
          created_at?: string
          icon?: string | null
          id?: string
          name?: string
          parent_id?: string | null
          show_in_dre?: boolean
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      client_obligations: {
        Row: {
          active: boolean | null
          company_id: string
          contact_id: string
          created_at: string
          id: string
          notes: string | null
          obligation_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean | null
          company_id: string
          contact_id: string
          created_at?: string
          id?: string
          notes?: string | null
          obligation_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean | null
          company_id?: string
          contact_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          obligation_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_obligations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_obligations_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_obligations_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "vw_cofre_global"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "client_obligations_obligation_id_fkey"
            columns: ["obligation_id"]
            isOneToOne: false
            referencedRelation: "fiscal_obligations_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      cnds: {
        Row: {
          arquivo_url: string | null
          company_id: string
          contact_id: string
          created_at: string
          data_emissao: string | null
          data_validade: string | null
          id: string
          numero: string | null
          observacao: string | null
          status: string
          tipo: string
          updated_at: string
        }
        Insert: {
          arquivo_url?: string | null
          company_id: string
          contact_id: string
          created_at?: string
          data_emissao?: string | null
          data_validade?: string | null
          id?: string
          numero?: string | null
          observacao?: string | null
          status?: string
          tipo: string
          updated_at?: string
        }
        Update: {
          arquivo_url?: string | null
          company_id?: string
          contact_id?: string
          created_at?: string
          data_emissao?: string | null
          data_validade?: string | null
          id?: string
          numero?: string | null
          observacao?: string | null
          status?: string
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cnds_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cnds_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cnds_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "vw_cofre_global"
            referencedColumns: ["contact_id"]
          },
        ]
      }
      cofre_acessos_log: {
        Row: {
          acao: string | null
          acesso_id: string | null
          contact_id: string | null
          created_at: string
          id: string
          portal: string | null
          usuario_id: string | null
          usuario_nome: string | null
        }
        Insert: {
          acao?: string | null
          acesso_id?: string | null
          contact_id?: string | null
          created_at?: string
          id?: string
          portal?: string | null
          usuario_id?: string | null
          usuario_nome?: string | null
        }
        Update: {
          acao?: string | null
          acesso_id?: string | null
          contact_id?: string | null
          created_at?: string
          id?: string
          portal?: string | null
          usuario_id?: string | null
          usuario_nome?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cofre_acessos_log_acesso_id_fkey"
            columns: ["acesso_id"]
            isOneToOne: false
            referencedRelation: "acessos_portais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cofre_acessos_log_acesso_id_fkey"
            columns: ["acesso_id"]
            isOneToOne: false
            referencedRelation: "vw_cofre_global"
            referencedColumns: ["acesso_id"]
          },
          {
            foreignKeyName: "cofre_acessos_log_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cofre_acessos_log_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "vw_cofre_global"
            referencedColumns: ["contact_id"]
          },
        ]
      }
      collaborator_coverage: {
        Row: {
          absent_profile_id: string
          auto_reverted_at: string | null
          clients_transferred: Json | null
          company_id: string
          covering_profile_id: string
          created_at: string
          created_by: string | null
          end_date: string | null
          id: string
          is_active: boolean | null
          notes: string | null
          reason: string | null
          revert_reason: string | null
          reverted_by: string | null
          start_date: string
          tasks_transferred: number | null
          updated_at: string
        }
        Insert: {
          absent_profile_id: string
          auto_reverted_at?: string | null
          clients_transferred?: Json | null
          company_id: string
          covering_profile_id: string
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          id?: string
          is_active?: boolean | null
          notes?: string | null
          reason?: string | null
          revert_reason?: string | null
          reverted_by?: string | null
          start_date: string
          tasks_transferred?: number | null
          updated_at?: string
        }
        Update: {
          absent_profile_id?: string
          auto_reverted_at?: string | null
          clients_transferred?: Json | null
          company_id?: string
          covering_profile_id?: string
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          id?: string
          is_active?: boolean | null
          notes?: string | null
          reason?: string | null
          revert_reason?: string | null
          reverted_by?: string | null
          start_date?: string
          tasks_transferred?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "collaborator_coverage_absent_profile_id_fkey"
            columns: ["absent_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collaborator_coverage_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collaborator_coverage_covering_profile_id_fkey"
            columns: ["covering_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collaborator_coverage_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collaborator_coverage_reverted_by_fkey"
            columns: ["reverted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          cnpj: string
          created_at: string
          id: string
          logo_url: string | null
          name: string
          phone: string | null
          plan_modules: string[]
          status: string
          updated_at: string
        }
        Insert: {
          cnpj: string
          created_at?: string
          id?: string
          logo_url?: string | null
          name: string
          phone?: string | null
          plan_modules?: string[]
          status?: string
          updated_at?: string
        }
        Update: {
          cnpj?: string
          created_at?: string
          id?: string
          logo_url?: string | null
          name?: string
          phone?: string | null
          plan_modules?: string[]
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      contact_documents: {
        Row: {
          category: string | null
          company_id: string
          contact_id: string
          file_name: string
          file_size: number | null
          file_type: string | null
          file_url: string
          id: string
          uploaded_at: string | null
        }
        Insert: {
          category?: string | null
          company_id: string
          contact_id: string
          file_name: string
          file_size?: number | null
          file_type?: string | null
          file_url: string
          id?: string
          uploaded_at?: string | null
        }
        Update: {
          category?: string | null
          company_id?: string
          contact_id?: string
          file_name?: string
          file_size?: number | null
          file_type?: string | null
          file_url?: string
          id?: string
          uploaded_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contact_documents_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_documents_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "vw_cofre_global"
            referencedColumns: ["contact_id"]
          },
        ]
      }
      contact_logs: {
        Row: {
          action: string
          company_id: string
          contact_id: string
          created_at: string
          description: string
          id: string
          user_id: string
          user_name: string | null
        }
        Insert: {
          action: string
          company_id: string
          contact_id: string
          created_at?: string
          description: string
          id?: string
          user_id: string
          user_name?: string | null
        }
        Update: {
          action?: string
          company_id?: string
          contact_id?: string
          created_at?: string
          description?: string
          id?: string
          user_id?: string
          user_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contact_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_logs_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_logs_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "vw_cofre_global"
            referencedColumns: ["contact_id"]
          },
        ]
      }
      contact_messages: {
        Row: {
          channel: string
          company_id: string
          contact_id: string
          created_at: string | null
          id: string
          message: string
          sent_at: string | null
          status: string
        }
        Insert: {
          channel: string
          company_id: string
          contact_id: string
          created_at?: string | null
          id?: string
          message: string
          sent_at?: string | null
          status?: string
        }
        Update: {
          channel?: string
          company_id?: string
          contact_id?: string
          created_at?: string | null
          id?: string
          message?: string
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_messages_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_messages_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "vw_cofre_global"
            referencedColumns: ["contact_id"]
          },
        ]
      }
      contact_notes: {
        Row: {
          company_id: string
          contact_id: string
          content: string
          created_at: string
          created_by: string
          id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          company_id: string
          contact_id: string
          content: string
          created_at?: string
          created_by: string
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          company_id?: string
          contact_id?: string
          content?: string
          created_at?: string
          created_by?: string
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contact_notes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_notes_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_notes_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "vw_cofre_global"
            referencedColumns: ["contact_id"]
          },
        ]
      }
      contact_partners: {
        Row: {
          ativo: boolean | null
          company_id: string
          contact_id: string
          cpf: string | null
          created_at: string
          created_by: string | null
          data_entrada: string | null
          data_saida: string | null
          email: string | null
          endereco: string | null
          id: string
          name: string
          participation_percentage: number | null
          rg: string | null
          updated_at: string
          whatsapp: string | null
        }
        Insert: {
          ativo?: boolean | null
          company_id: string
          contact_id: string
          cpf?: string | null
          created_at?: string
          created_by?: string | null
          data_entrada?: string | null
          data_saida?: string | null
          email?: string | null
          endereco?: string | null
          id?: string
          name: string
          participation_percentage?: number | null
          rg?: string | null
          updated_at?: string
          whatsapp?: string | null
        }
        Update: {
          ativo?: boolean | null
          company_id?: string
          contact_id?: string
          cpf?: string | null
          created_at?: string
          created_by?: string | null
          data_entrada?: string | null
          data_saida?: string | null
          email?: string | null
          endereco?: string | null
          id?: string
          name?: string
          participation_percentage?: number | null
          rg?: string | null
          updated_at?: string
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contact_partners_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_partners_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "vw_cofre_global"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "contact_partners_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          address: string | null
          address_number: string | null
          boleto_active: boolean
          boleto_due_day: number | null
          boleto_start_date: string | null
          boleto_value: number | null
          canal_entrega: string | null
          categorias: string[] | null
          cep: string | null
          city: string | null
          cnae_principal: Json | null
          cnaes_secundarios: Json | null
          company_id: string
          complemento: string | null
          created_at: string
          data_abertura_estado: string | null
          data_abertura_junta: string | null
          data_abertura_prefeitura: string | null
          data_abertura_receita: string | null
          data_abertura_rf: string | null
          data_encerramento_estado: string | null
          data_encerramento_junta: string | null
          data_encerramento_prefeitura: string | null
          data_encerramento_rf: string | null
          data_inicio_contrato: string | null
          data_saida_cliente: string | null
          document: string | null
          email: string | null
          enviar_cobranca_auto: boolean
          grupo_cipa: string | null
          grupo_escritorio: string | null
          id: string
          ie: string | null
          im: string | null
          inventario: boolean | null
          is_active: boolean
          medicina_trabalho: boolean | null
          name: string
          natureza_juridica: string | null
          neighborhood: string | null
          nome_fantasia: string | null
          notes: string | null
          numero_alvara: string | null
          numero_cliente_sicoob: number | null
          numero_funcionarios: number | null
          origin: string
          phone: string | null
          porte: string | null
          possui_funcionarios: boolean | null
          razao_social: string | null
          regime_apuracao: string | null
          registro_entradas: boolean | null
          registro_icms: boolean | null
          registro_saidas: boolean | null
          representative_legal: string | null
          responsible_id: string | null
          segundo_email_contato: string | null
          siare_senha_encrypted: string | null
          situacao_cadastral: string | null
          state: string | null
          status_cliente: string | null
          tax_regime: string | null
          tipo_cartao_ponto: string | null
          tipo_cliente: string | null
          tipo_estabelecimento: string | null
          type: string
          updated_at: string
          validade_alvara: string | null
          whatsapp: string | null
        }
        Insert: {
          address?: string | null
          address_number?: string | null
          boleto_active?: boolean
          boleto_due_day?: number | null
          boleto_start_date?: string | null
          boleto_value?: number | null
          canal_entrega?: string | null
          categorias?: string[] | null
          cep?: string | null
          city?: string | null
          cnae_principal?: Json | null
          cnaes_secundarios?: Json | null
          company_id: string
          complemento?: string | null
          created_at?: string
          data_abertura_estado?: string | null
          data_abertura_junta?: string | null
          data_abertura_prefeitura?: string | null
          data_abertura_receita?: string | null
          data_abertura_rf?: string | null
          data_encerramento_estado?: string | null
          data_encerramento_junta?: string | null
          data_encerramento_prefeitura?: string | null
          data_encerramento_rf?: string | null
          data_inicio_contrato?: string | null
          data_saida_cliente?: string | null
          document?: string | null
          email?: string | null
          enviar_cobranca_auto?: boolean
          grupo_cipa?: string | null
          grupo_escritorio?: string | null
          id?: string
          ie?: string | null
          im?: string | null
          inventario?: boolean | null
          is_active?: boolean
          medicina_trabalho?: boolean | null
          name: string
          natureza_juridica?: string | null
          neighborhood?: string | null
          nome_fantasia?: string | null
          notes?: string | null
          numero_alvara?: string | null
          numero_cliente_sicoob?: number | null
          numero_funcionarios?: number | null
          origin?: string
          phone?: string | null
          porte?: string | null
          possui_funcionarios?: boolean | null
          razao_social?: string | null
          regime_apuracao?: string | null
          registro_entradas?: boolean | null
          registro_icms?: boolean | null
          registro_saidas?: boolean | null
          representative_legal?: string | null
          responsible_id?: string | null
          segundo_email_contato?: string | null
          siare_senha_encrypted?: string | null
          situacao_cadastral?: string | null
          state?: string | null
          status_cliente?: string | null
          tax_regime?: string | null
          tipo_cartao_ponto?: string | null
          tipo_cliente?: string | null
          tipo_estabelecimento?: string | null
          type: string
          updated_at?: string
          validade_alvara?: string | null
          whatsapp?: string | null
        }
        Update: {
          address?: string | null
          address_number?: string | null
          boleto_active?: boolean
          boleto_due_day?: number | null
          boleto_start_date?: string | null
          boleto_value?: number | null
          canal_entrega?: string | null
          categorias?: string[] | null
          cep?: string | null
          city?: string | null
          cnae_principal?: Json | null
          cnaes_secundarios?: Json | null
          company_id?: string
          complemento?: string | null
          created_at?: string
          data_abertura_estado?: string | null
          data_abertura_junta?: string | null
          data_abertura_prefeitura?: string | null
          data_abertura_receita?: string | null
          data_abertura_rf?: string | null
          data_encerramento_estado?: string | null
          data_encerramento_junta?: string | null
          data_encerramento_prefeitura?: string | null
          data_encerramento_rf?: string | null
          data_inicio_contrato?: string | null
          data_saida_cliente?: string | null
          document?: string | null
          email?: string | null
          enviar_cobranca_auto?: boolean
          grupo_cipa?: string | null
          grupo_escritorio?: string | null
          id?: string
          ie?: string | null
          im?: string | null
          inventario?: boolean | null
          is_active?: boolean
          medicina_trabalho?: boolean | null
          name?: string
          natureza_juridica?: string | null
          neighborhood?: string | null
          nome_fantasia?: string | null
          notes?: string | null
          numero_alvara?: string | null
          numero_cliente_sicoob?: number | null
          numero_funcionarios?: number | null
          origin?: string
          phone?: string | null
          porte?: string | null
          possui_funcionarios?: boolean | null
          razao_social?: string | null
          regime_apuracao?: string | null
          registro_entradas?: boolean | null
          registro_icms?: boolean | null
          registro_saidas?: boolean | null
          representative_legal?: string | null
          responsible_id?: string | null
          segundo_email_contato?: string | null
          siare_senha_encrypted?: string | null
          situacao_cadastral?: string | null
          state?: string | null
          status_cliente?: string | null
          tax_regime?: string | null
          tipo_cartao_ponto?: string | null
          tipo_cliente?: string | null
          tipo_estabelecimento?: string | null
          type?: string
          updated_at?: string
          validade_alvara?: string | null
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      content_generated: {
        Row: {
          carousel_slides: Json | null
          company_id: string
          created_at: string
          facebook_caption: string | null
          gmb_post: string | null
          id: string
          image_url: string | null
          instagram_caption: string | null
          linkedin_post: string | null
          pillar: string | null
          published_at: string | null
          queue_item_id: string | null
          reels_script: string | null
          scheduled_at: string | null
          status: string
          topic: string
          updated_at: string
        }
        Insert: {
          carousel_slides?: Json | null
          company_id: string
          created_at?: string
          facebook_caption?: string | null
          gmb_post?: string | null
          id?: string
          image_url?: string | null
          instagram_caption?: string | null
          linkedin_post?: string | null
          pillar?: string | null
          published_at?: string | null
          queue_item_id?: string | null
          reels_script?: string | null
          scheduled_at?: string | null
          status?: string
          topic: string
          updated_at?: string
        }
        Update: {
          carousel_slides?: Json | null
          company_id?: string
          created_at?: string
          facebook_caption?: string | null
          gmb_post?: string | null
          id?: string
          image_url?: string | null
          instagram_caption?: string | null
          linkedin_post?: string | null
          pillar?: string | null
          published_at?: string | null
          queue_item_id?: string | null
          reels_script?: string | null
          scheduled_at?: string | null
          status?: string
          topic?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_generated_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_generated_queue_item_id_fkey"
            columns: ["queue_item_id"]
            isOneToOne: false
            referencedRelation: "content_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      content_queue: {
        Row: {
          angle_suggestion: string | null
          collected_at: string
          company_id: string
          created_at: string
          curated_at: string | null
          curator_notes: string | null
          destination: string
          id: string
          pillar: string | null
          raw_content: string | null
          relevance_score: number | null
          source_name: string | null
          source_url: string | null
          summary: string | null
          title: string
          updated_at: string
          urgency: string | null
        }
        Insert: {
          angle_suggestion?: string | null
          collected_at?: string
          company_id: string
          created_at?: string
          curated_at?: string | null
          curator_notes?: string | null
          destination?: string
          id?: string
          pillar?: string | null
          raw_content?: string | null
          relevance_score?: number | null
          source_name?: string | null
          source_url?: string | null
          summary?: string | null
          title: string
          updated_at?: string
          urgency?: string | null
        }
        Update: {
          angle_suggestion?: string | null
          collected_at?: string
          company_id?: string
          created_at?: string
          curated_at?: string | null
          curator_notes?: string | null
          destination?: string
          id?: string
          pillar?: string | null
          raw_content?: string | null
          relevance_score?: number | null
          source_name?: string | null
          source_url?: string | null
          summary?: string | null
          title?: string
          updated_at?: string
          urgency?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_queue_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      curadoria_sessions: {
        Row: {
          company_id: string
          created_at: string | null
          id: string
          item_ids: string[]
          session_date: string
        }
        Insert: {
          company_id?: string
          created_at?: string | null
          id?: string
          item_ids: string[]
          session_date: string
        }
        Update: {
          company_id?: string
          created_at?: string | null
          id?: string
          item_ids?: string[]
          session_date?: string
        }
        Relationships: []
      }
      dre_budgets: {
        Row: {
          budget_value: number
          category_id: string
          company_id: string
          created_at: string
          id: string
          month_year: string
          updated_at: string
        }
        Insert: {
          budget_value?: number
          category_id: string
          company_id: string
          created_at?: string
          id?: string
          month_year: string
          updated_at?: string
        }
        Update: {
          budget_value?: number
          category_id?: string
          company_id?: string
          created_at?: string
          id?: string
          month_year?: string
          updated_at?: string
        }
        Relationships: []
      }
      editorial_calendar: {
        Row: {
          channel: string
          company_id: string
          content_generated_id: string | null
          created_at: string
          format: string | null
          id: string
          is_open_slot: boolean
          month_year: string
          notes: string | null
          pillar: string | null
          slot_date: string
          status: string
          topic: string | null
          updated_at: string
          week_number: number | null
        }
        Insert: {
          channel: string
          company_id: string
          content_generated_id?: string | null
          created_at?: string
          format?: string | null
          id?: string
          is_open_slot?: boolean
          month_year: string
          notes?: string | null
          pillar?: string | null
          slot_date: string
          status?: string
          topic?: string | null
          updated_at?: string
          week_number?: number | null
        }
        Update: {
          channel?: string
          company_id?: string
          content_generated_id?: string | null
          created_at?: string
          format?: string | null
          id?: string
          is_open_slot?: boolean
          month_year?: string
          notes?: string | null
          pillar?: string | null
          slot_date?: string
          status?: string
          topic?: string | null
          updated_at?: string
          week_number?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "editorial_calendar_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "editorial_calendar_content_generated_id_fkey"
            columns: ["content_generated_id"]
            isOneToOne: false
            referencedRelation: "content_generated"
            referencedColumns: ["id"]
          },
        ]
      }
      fiscal_calendar: {
        Row: {
          adjusted_due_date: string
          adjusted_due_date_override: string | null
          competence_month: number | null
          competence_year: number | null
          created_at: string
          id: string
          internal_delivery_date: string
          internal_delivery_date_override: string | null
          month: number | null
          obligation_id: string
          overridden_at: string | null
          overridden_by: string | null
          override_reason: string | null
          raw_due_date: string
          updated_at: string
          year: number
        }
        Insert: {
          adjusted_due_date: string
          adjusted_due_date_override?: string | null
          competence_month?: number | null
          competence_year?: number | null
          created_at?: string
          id?: string
          internal_delivery_date: string
          internal_delivery_date_override?: string | null
          month?: number | null
          obligation_id: string
          overridden_at?: string | null
          overridden_by?: string | null
          override_reason?: string | null
          raw_due_date: string
          updated_at?: string
          year: number
        }
        Update: {
          adjusted_due_date?: string
          adjusted_due_date_override?: string | null
          competence_month?: number | null
          competence_year?: number | null
          created_at?: string
          id?: string
          internal_delivery_date?: string
          internal_delivery_date_override?: string | null
          month?: number | null
          obligation_id?: string
          overridden_at?: string | null
          overridden_by?: string | null
          override_reason?: string | null
          raw_due_date?: string
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "fiscal_calendar_obligation_id_fkey"
            columns: ["obligation_id"]
            isOneToOne: false
            referencedRelation: "fiscal_obligations_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fiscal_calendar_overridden_by_fkey"
            columns: ["overridden_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      fiscal_obligations_catalog: {
        Row: {
          active: boolean | null
          applies_to: string[]
          code: string | null
          company_id: string | null
          created_at: string
          description: string | null
          due_rule: string
          frequency: string
          holiday_adjustment: string
          id: string
          is_custom: boolean
          name: string
          requires_employees: boolean | null
          updated_at: string
        }
        Insert: {
          active?: boolean | null
          applies_to: string[]
          code?: string | null
          company_id?: string | null
          created_at?: string
          description?: string | null
          due_rule: string
          frequency: string
          holiday_adjustment: string
          id?: string
          is_custom?: boolean
          name: string
          requires_employees?: boolean | null
          updated_at?: string
        }
        Update: {
          active?: boolean | null
          applies_to?: string[]
          code?: string | null
          company_id?: string | null
          created_at?: string
          description?: string | null
          due_rule?: string
          frequency?: string
          holiday_adjustment?: string
          id?: string
          is_custom?: boolean
          name?: string
          requires_employees?: boolean | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fiscal_obligations_catalog_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      fiscal_tasks: {
        Row: {
          attachment_url: string | null
          calendar_id: string | null
          company_id: string
          competence_month: number | null
          competence_year: number | null
          completed_at: string | null
          contact_id: string
          created_at: string
          delivery_date: string | null
          description: string | null
          due_date: string
          fiscal_due_date: string | null
          id: string
          is_auto_generated: boolean | null
          notes: string | null
          obligation_id: string | null
          original_responsible_id: string | null
          responsible_id: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          attachment_url?: string | null
          calendar_id?: string | null
          company_id: string
          competence_month?: number | null
          competence_year?: number | null
          completed_at?: string | null
          contact_id: string
          created_at?: string
          delivery_date?: string | null
          description?: string | null
          due_date: string
          fiscal_due_date?: string | null
          id?: string
          is_auto_generated?: boolean | null
          notes?: string | null
          obligation_id?: string | null
          original_responsible_id?: string | null
          responsible_id?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          attachment_url?: string | null
          calendar_id?: string | null
          company_id?: string
          competence_month?: number | null
          competence_year?: number | null
          completed_at?: string | null
          contact_id?: string
          created_at?: string
          delivery_date?: string | null
          description?: string | null
          due_date?: string
          fiscal_due_date?: string | null
          id?: string
          is_auto_generated?: boolean | null
          notes?: string | null
          obligation_id?: string | null
          original_responsible_id?: string | null
          responsible_id?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fiscal_tasks_calendar_id_fkey"
            columns: ["calendar_id"]
            isOneToOne: false
            referencedRelation: "fiscal_calendar"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fiscal_tasks_calendar_id_fkey"
            columns: ["calendar_id"]
            isOneToOne: false
            referencedRelation: "fiscal_calendar_effective"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fiscal_tasks_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fiscal_tasks_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "vw_cofre_global"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "fiscal_tasks_obligation_id_fkey"
            columns: ["obligation_id"]
            isOneToOne: false
            referencedRelation: "fiscal_obligations_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fiscal_tasks_original_responsible_id_fkey"
            columns: ["original_responsible_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fiscal_tasks_responsible_id_fkey"
            columns: ["responsible_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      global_logs: {
        Row: {
          action: string
          company_id: string
          created_at: string
          details: string
          entity_id: string | null
          entity_name: string | null
          id: string
          module: string
          user_id: string
          user_name: string | null
        }
        Insert: {
          action: string
          company_id: string
          created_at?: string
          details: string
          entity_id?: string | null
          entity_name?: string | null
          id?: string
          module: string
          user_id: string
          user_name?: string | null
        }
        Update: {
          action?: string
          company_id?: string
          created_at?: string
          details?: string
          entity_id?: string | null
          entity_name?: string | null
          id?: string
          module?: string
          user_id?: string
          user_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "global_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      historico_eventos: {
        Row: {
          campos_alterados: string[] | null
          created_at: string
          dados_anteriores: Json | null
          dados_novos: Json | null
          id: string
          operacao: string
          registro_id: string
          tabela: string
          usuario_id: string | null
          usuario_nome: string | null
        }
        Insert: {
          campos_alterados?: string[] | null
          created_at?: string
          dados_anteriores?: Json | null
          dados_novos?: Json | null
          id?: string
          operacao: string
          registro_id: string
          tabela: string
          usuario_id?: string | null
          usuario_nome?: string | null
        }
        Update: {
          campos_alterados?: string[] | null
          created_at?: string
          dados_anteriores?: Json | null
          dados_novos?: Json | null
          id?: string
          operacao?: string
          registro_id?: string
          tabela?: string
          usuario_id?: string | null
          usuario_nome?: string | null
        }
        Relationships: []
      }
      honorarios_historico: {
        Row: {
          boleto_control_id: string | null
          canal_envio: string | null
          company_id: string
          competencia: string
          contact_id: string
          created_at: string
          data_pagamento: string | null
          data_vencimento: string
          id: string
          linha_digitavel: string | null
          nosso_numero: string | null
          pdf_url: string | null
          status: string
          valor: number
        }
        Insert: {
          boleto_control_id?: string | null
          canal_envio?: string | null
          company_id: string
          competencia: string
          contact_id: string
          created_at?: string
          data_pagamento?: string | null
          data_vencimento: string
          id?: string
          linha_digitavel?: string | null
          nosso_numero?: string | null
          pdf_url?: string | null
          status?: string
          valor: number
        }
        Update: {
          boleto_control_id?: string | null
          canal_envio?: string | null
          company_id?: string
          competencia?: string
          contact_id?: string
          created_at?: string
          data_pagamento?: string | null
          data_vencimento?: string
          id?: string
          linha_digitavel?: string | null
          nosso_numero?: string | null
          pdf_url?: string | null
          status?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "honorarios_historico_boleto_control_id_fkey"
            columns: ["boleto_control_id"]
            isOneToOne: false
            referencedRelation: "boleto_controls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "honorarios_historico_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "honorarios_historico_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "honorarios_historico_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "vw_cofre_global"
            referencedColumns: ["contact_id"]
          },
        ]
      }
      metrics_monthly: {
        Row: {
          clicks: number | null
          collected_at: string | null
          company_id: string
          created_at: string
          engagement: number | null
          engagement_rate: number | null
          followers: number | null
          id: string
          impressions: number | null
          month_year: string
          platform: string
          posts_count: number | null
          profile_views: number | null
          raw_data: Json | null
          reach: number | null
        }
        Insert: {
          clicks?: number | null
          collected_at?: string | null
          company_id: string
          created_at?: string
          engagement?: number | null
          engagement_rate?: number | null
          followers?: number | null
          id?: string
          impressions?: number | null
          month_year: string
          platform: string
          posts_count?: number | null
          profile_views?: number | null
          raw_data?: Json | null
          reach?: number | null
        }
        Update: {
          clicks?: number | null
          collected_at?: string | null
          company_id?: string
          created_at?: string
          engagement?: number | null
          engagement_rate?: number | null
          followers?: number | null
          id?: string
          impressions?: number | null
          month_year?: string
          platform?: string
          posts_count?: number | null
          profile_views?: number | null
          raw_data?: Json | null
          reach?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "metrics_monthly_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      monitor_cnpj: {
        Row: {
          cnpj: string
          company_id: string
          contact_id: string
          created_at: string
          dados_completos: Json | null
          data_consulta: string
          id: string
          situacao_anterior: string | null
          situacao_nova: string
        }
        Insert: {
          cnpj: string
          company_id: string
          contact_id: string
          created_at?: string
          dados_completos?: Json | null
          data_consulta?: string
          id?: string
          situacao_anterior?: string | null
          situacao_nova: string
        }
        Update: {
          cnpj?: string
          company_id?: string
          contact_id?: string
          created_at?: string
          dados_completos?: Json | null
          data_consulta?: string
          id?: string
          situacao_anterior?: string | null
          situacao_nova?: string
        }
        Relationships: [
          {
            foreignKeyName: "monitor_cnpj_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monitor_cnpj_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monitor_cnpj_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "vw_cofre_global"
            referencedColumns: ["contact_id"]
          },
        ]
      }
      national_holidays: {
        Row: {
          created_at: string
          date: string
          id: string
          name: string
          state: string | null
          type: string
        }
        Insert: {
          created_at?: string
          date: string
          id?: string
          name: string
          state?: string | null
          type?: string
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          name?: string
          state?: string | null
          type?: string
        }
        Relationships: []
      }
      newsletters: {
        Row: {
          approved_at: string | null
          company_id: string
          content: string
          created_at: string | null
          id: string
          items_count: number | null
          sent_at: string | null
          slug: string
          status: string | null
          title: string
          type: string
          whatsapp_group_jid: string | null
        }
        Insert: {
          approved_at?: string | null
          company_id?: string
          content: string
          created_at?: string | null
          id?: string
          items_count?: number | null
          sent_at?: string | null
          slug: string
          status?: string | null
          title: string
          type: string
          whatsapp_group_jid?: string | null
        }
        Update: {
          approved_at?: string | null
          company_id?: string
          content?: string
          created_at?: string | null
          id?: string
          items_count?: number | null
          sent_at?: string | null
          slug?: string
          status?: string | null
          title?: string
          type?: string
          whatsapp_group_jid?: string | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          action_url: string | null
          body: string | null
          company_id: string | null
          created_at: string
          id: string
          read_at: string | null
          reference_id: string | null
          reference_type: string | null
          task_id: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          action_url?: string | null
          body?: string | null
          company_id?: string | null
          created_at?: string
          id?: string
          read_at?: string | null
          reference_id?: string | null
          reference_type?: string | null
          task_id?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          action_url?: string | null
          body?: string | null
          company_id?: string | null
          created_at?: string
          id?: string
          read_at?: string | null
          reference_id?: string | null
          reference_type?: string | null
          task_id?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "fiscal_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_steps: {
        Row: {
          company_id: string
          contact_id: string
          created_at: string
          data_conclusao: string | null
          data_inicio: string | null
          etapa: string
          fluxo: string
          id: string
          observacao: string | null
          ordem: number
          responsavel_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          company_id: string
          contact_id: string
          created_at?: string
          data_conclusao?: string | null
          data_inicio?: string | null
          etapa: string
          fluxo: string
          id?: string
          observacao?: string | null
          ordem?: number
          responsavel_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          contact_id?: string
          created_at?: string
          data_conclusao?: string | null
          data_inicio?: string | null
          etapa?: string
          fluxo?: string
          id?: string
          observacao?: string | null
          ordem?: number
          responsavel_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_steps_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_steps_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_steps_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "vw_cofre_global"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "onboarding_steps_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          allowed_modules: string[]
          avatar_url: string | null
          company_id: string
          created_at: string
          email: string
          force_password_change: boolean
          full_name: string | null
          id: string
          is_super_admin: boolean
          password_changed_at: string | null
          role: string
          status: string | null
          status_active: boolean
          updated_at: string
          user_id: string
          username: string | null
        }
        Insert: {
          allowed_modules?: string[]
          avatar_url?: string | null
          company_id: string
          created_at?: string
          email: string
          force_password_change?: boolean
          full_name?: string | null
          id?: string
          is_super_admin?: boolean
          password_changed_at?: string | null
          role?: string
          status?: string | null
          status_active?: boolean
          updated_at?: string
          user_id: string
          username?: string | null
        }
        Update: {
          allowed_modules?: string[]
          avatar_url?: string | null
          company_id?: string
          created_at?: string
          email?: string
          force_password_change?: boolean
          full_name?: string | null
          id?: string
          is_super_admin?: boolean
          password_changed_at?: string | null
          role?: string
          status?: string | null
          status_active?: boolean
          updated_at?: string
          user_id?: string
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_transactions: {
        Row: {
          amount: number
          bank_id: string | null
          category_id: string | null
          company_id: string
          contact_id: string | null
          created_at: string
          day_of_month: number | null
          days_of_week: string | null
          description: string
          end_date: string | null
          frequency: string
          id: string
          is_active: boolean
          notes: string | null
          start_date: string
          times_per_week: number | null
          type: string
          updated_at: string
        }
        Insert: {
          amount: number
          bank_id?: string | null
          category_id?: string | null
          company_id: string
          contact_id?: string | null
          created_at?: string
          day_of_month?: number | null
          days_of_week?: string | null
          description: string
          end_date?: string | null
          frequency?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          start_date?: string
          times_per_week?: number | null
          type: string
          updated_at?: string
        }
        Update: {
          amount?: number
          bank_id?: string | null
          category_id?: string | null
          company_id?: string
          contact_id?: string | null
          created_at?: string
          day_of_month?: number | null
          days_of_week?: string | null
          description?: string
          end_date?: string | null
          frequency?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          start_date?: string
          times_per_week?: number | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_transactions_bank_id_fkey"
            columns: ["bank_id"]
            isOneToOne: false
            referencedRelation: "banks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_transactions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_transactions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_transactions_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_transactions_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "vw_cofre_global"
            referencedColumns: ["contact_id"]
          },
        ]
      }
      transaction_attachments: {
        Row: {
          company_id: string
          created_at: string
          file_name: string
          file_size: number | null
          file_type: string | null
          file_url: string
          id: string
          transaction_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          file_name: string
          file_size?: number | null
          file_type?: string | null
          file_url: string
          id?: string
          transaction_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          file_name?: string
          file_size?: number | null
          file_type?: string | null
          file_url?: string
          id?: string
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transaction_attachments_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          amount: number
          bank_id: string | null
          category_id: string | null
          company_id: string
          contact_id: string | null
          created_at: string
          date: string | null
          deleted_at: string | null
          description: string
          due_date: string | null
          expected_date: string | null
          id: string
          is_paid: boolean
          issue_date: string | null
          notes: string | null
          paid_amount: number | null
          type: string
          updated_at: string
        }
        Insert: {
          amount: number
          bank_id?: string | null
          category_id?: string | null
          company_id: string
          contact_id?: string | null
          created_at?: string
          date?: string | null
          deleted_at?: string | null
          description: string
          due_date?: string | null
          expected_date?: string | null
          id?: string
          is_paid?: boolean
          issue_date?: string | null
          notes?: string | null
          paid_amount?: number | null
          type: string
          updated_at?: string
        }
        Update: {
          amount?: number
          bank_id?: string | null
          category_id?: string | null
          company_id?: string
          contact_id?: string | null
          created_at?: string
          date?: string | null
          deleted_at?: string | null
          description?: string
          due_date?: string | null
          expected_date?: string | null
          id?: string
          is_paid?: boolean
          issue_date?: string | null
          notes?: string | null
          paid_amount?: number | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_bank_id_fkey"
            columns: ["bank_id"]
            isOneToOne: false
            referencedRelation: "banks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "vw_cofre_global"
            referencedColumns: ["contact_id"]
          },
        ]
      }
      transfer_log: {
        Row: {
          company_id: string
          contact_ids: string[]
          from_profile_id: string
          id: string
          notes: string | null
          reverted_at: string | null
          reverted_by: string | null
          task_ids: string[]
          to_profile_id: string
          transferred_at: string
          transferred_by: string | null
        }
        Insert: {
          company_id: string
          contact_ids?: string[]
          from_profile_id: string
          id?: string
          notes?: string | null
          reverted_at?: string | null
          reverted_by?: string | null
          task_ids?: string[]
          to_profile_id: string
          transferred_at?: string
          transferred_by?: string | null
        }
        Update: {
          company_id?: string
          contact_ids?: string[]
          from_profile_id?: string
          id?: string
          notes?: string | null
          reverted_at?: string | null
          reverted_by?: string | null
          task_ids?: string[]
          to_profile_id?: string
          transferred_at?: string
          transferred_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transfer_log_from_profile_id_fkey"
            columns: ["from_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfer_log_reverted_by_fkey"
            columns: ["reverted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfer_log_to_profile_id_fkey"
            columns: ["to_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfer_log_transferred_by_fkey"
            columns: ["transferred_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      fiscal_calendar_effective: {
        Row: {
          adjusted_due_date: string | null
          adjusted_due_date_override: string | null
          applies_to: string[] | null
          competence_month: number | null
          competence_year: number | null
          created_at: string | null
          effective_delivery_date: string | null
          effective_due_date: string | null
          frequency: string | null
          has_override: boolean | null
          holiday_adjustment: string | null
          id: string | null
          internal_delivery_date: string | null
          internal_delivery_date_override: string | null
          month: number | null
          obligation_code: string | null
          obligation_id: string | null
          obligation_name: string | null
          overridden_at: string | null
          overridden_by: string | null
          override_reason: string | null
          raw_due_date: string | null
          requires_employees: boolean | null
          updated_at: string | null
          year: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fiscal_calendar_obligation_id_fkey"
            columns: ["obligation_id"]
            isOneToOne: false
            referencedRelation: "fiscal_obligations_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fiscal_calendar_overridden_by_fkey"
            columns: ["overridden_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_cofre_global: {
        Row: {
          acesso_id: string | null
          alerta_vencimento: boolean | null
          cliente_nome: string | null
          cnpj: string | null
          contact_id: string | null
          login: string | null
          observacao: string | null
          portal: Database["public"]["Enums"]["portal_tipo"] | null
          portal_label: string | null
          senha_atualizada_em: string | null
          validade_certificado: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      cofre_decrypt_internal: {
        Args: { p_encrypted: string; p_key: string }
        Returns: string
      }
      cofre_encrypt_internal: {
        Args: { p_key: string; p_plaintext: string }
        Returns: string
      }
      generate_monthly_fiscal_tasks: {
        Args: { p_month: number; p_year: number }
        Returns: Json
      }
      get_annual_metrics: {
        Args: {
          p_bank_id?: string
          p_category_id?: string
          p_contact_id?: string
          p_year: number
        }
        Returns: Json
      }
      get_category_breakdown: {
        Args: {
          p_bank_id?: string
          p_contact_id?: string
          p_end_date: string
          p_limit?: number
          p_start_date: string
          p_type: string
        }
        Returns: Json
      }
      get_dashboard_summary: {
        Args: {
          p_bank_id?: string
          p_category_id?: string
          p_contact_id?: string
          p_end_date: string
          p_payment_status?: string
          p_start_date: string
        }
        Returns: Json
      }
      get_effective_responsible: {
        Args: { p_date: string; p_profile_id: string }
        Returns: string
      }
      get_monthly_evolution: {
        Args: {
          p_bank_id?: string
          p_category_id?: string
          p_contact_id?: string
          p_months?: number
        }
        Returns: Json
      }
      get_transaction_kpis: {
        Args: {
          p_bank_id?: string
          p_category_id?: string
          p_contact_id?: string
          p_end_date?: string
          p_payment_status?: string
          p_search?: string
          p_start_date?: string
          p_type?: string
        }
        Returns: Json
      }
      get_user_company_id: { Args: { _user_id: string }; Returns: string }
      get_user_role: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
      revert_transfer: { Args: { p_transfer_log_id: string }; Returns: Json }
      transfer_clients_with_log: {
        Args: { p_from_profile_id: string; p_to_profile_id: string }
        Returns: Json
      }
    }
    Enums: {
      app_role: "admin" | "colaborador" | "cliente"
      portal_tipo:
        | "gov_br"
        | "siare"
        | "certificado_digital"
        | "ecac"
        | "prefeitura_nfse"
        | "sefaz_estadual"
        | "esocial"
        | "conectividade_social"
        | "outros"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "colaborador", "cliente"],
      portal_tipo: [
        "gov_br",
        "siare",
        "certificado_digital",
        "ecac",
        "prefeitura_nfse",
        "sefaz_estadual",
        "esocial",
        "conectividade_social",
        "outros",
      ],
    },
  },
} as const
