export type Json =
    | string
    | number
    | boolean
    | null
    | { [key: string]: Json | undefined }
    | Json[]

export interface Database {
    public: {
        Tables: {
            // ... tus tablas (puedes dejarlo vacío por ahora)
        }
        Views: {
            // ... tus vistas
        }
        Functions: {
            approve_redemption_request: {
                Args: {
                    p_request_id: string;
                    p_staff_id: string;
                    p_notes: string;
                    p_branch_id: string | null;
                    p_comment_category: string | null;
                };
                Returns: void;
            };
            // Otras funciones RPC que uses...
        }
        Enums: {
            // ... tus enums
        }
    }
}