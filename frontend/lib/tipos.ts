// A forma dos dados que vêm do banco.
//
// Fora do page.tsx porque tipo é contrato: quando três componentes precisam
// saber o que é um Lançamento, o lugar do contrato não pode ser dentro de um
// deles. Também é o que permite quebrar o painel em partes sem que cada uma
// redeclare a mesma coisa com uma vírgula de diferença.

export type Transaction = {
  id: string;
  user_phone: string;
  amount: number;
  type: 'receita' | 'despesa';
  category: string;
  description: string | null;
  created_at: string;
};

export // Uma transação comum, ou um lançamento do cofrinho apresentado como tal.
// A origem diz de qual tabela ele veio, pra editar e apagar acertarem o alvo.
type Lancamento = Transaction & { origem?: 'guardado' | 'parcela' };

export type Debt = {
  id: string;
  user_phone: string;
  amount: number;
  direction: 'a_receber' | 'a_pagar';
  person: string | null;
  description: string | null;
  status: 'pendente' | 'quitada';
  created_at: string;
};

export type Installment = {
  id: string;
  user_phone: string;
  purchase_id: string;
  description: string;
  category: string;
  installment_number: number;
  installments_total: number;
  amount: number;
  due_month: string;
  paid: boolean;
  paid_at: string | null;
};

export type Saving = {
  id: string;
  user_phone: string;
  amount: number;
  jar: string | null;
  description: string | null;
  created_at: string;
};

export type Goal = {
  user_phone: string;
  monthly_target: number | null;
  goal_name: string | null;
  goal_target: number | null;
};

export type Categoria = {
  id: string;
  user_phone: string;
  name: string;
  kind: 'despesa' | 'receita';
};

export type Recorrente = {
  id: string;
  user_phone: string;
  description: string;
  amount: number;
  type: 'receita' | 'despesa';
  category: string;
  day_of_month: number;
  active: boolean;
};

export type Aba = 'mes' | 'guardado' | 'ajustes';
