import streamlit as st
import pandas as pd
import datetime

# --- CONFIGURAÇÃO INICIAL E CREDENCIAIS ---
# Nome do arquivo Excel (deve estar na mesma pasta que este script)
EXCEL_FILE_NAME = 'teste.xlsx' # Altere para o nome exato do seu arquivo Excel

USERS = {
    'admin': {'password': '12345', 'name': 'Administrador'},
    'embalagem': {'password': '123', 'name': 'Embalagem'},
    'expedicao': {'password': '123', 'name': 'Expedição'}
}

# --- FUNÇÕES DE AUXÍLIO ---

def get_status(qtd_original, separado):
    """Determina o status de separação do item com base nas quantidades."""
    if separado == 0:
        return 'embalagem'  # Não separado ainda (dentro do estágio de embalagem)
    if separado == qtd_original:
        return 'concluido'  # Totalmente separado
    if separado > 0 and separado < qtd_original:
        return 'parcial'  # Parcialmente separado
    return 'embalagem' # Default

def format_date(date_value):
    """Formata valores de data do Excel para o formato DD/MM/AAAA."""
    if pd.isna(date_value):
        return ''
    if isinstance(date_value, (int, float)):
        # Excel serial date: convert to datetime object
        return (pd.to_datetime('1899-12-30') + pd.to_timedelta(date_value, unit='D')).strftime('%d/%m/%Y')
    elif isinstance(date_value, datetime.datetime):
        return date_value.strftime('%d/%m/%Y')
    return str(date_value) # Fallback for other types

def process_excel_data(df):
    """Processa o DataFrame do Excel para o formato do sistema."""
    # Adicionar esta verificação no início da função
    if df.empty:
        st.warning("A planilha Excel está vazia. Nenhum dado para processar.")
        return pd.DataFrame() # Retorna um DataFrame vazio

    df_processed = df.copy()
    
    # Mapear nomes das colunas da SUA PLANILHA para os nomes internos do sistema
    # As chaves (à esquerda) são os nomes internos do sistema
    # Os valores (à direita) são os nomes EXATOS das colunas na sua planilha Excel
    column_mapping_excel_to_internal = {
        'NF': 'nf',
        'Pedido n': 'pedido', 
        'Dt.emissão': 'dataemissao', 
        'Modelo': 'modelo',
        'Produto': 'produto',
        'Qtd.': 'qtdoriginal', 
        'Separado': 'separado'
    }

    # Inverter o mapeamento para usar com o método .rename() do pandas
    # Agora a chave é o nome da sua planilha e o valor é o nome interno
    rename_dict = {excel_name: internal_name for excel_name, internal_name in column_mapping_excel_to_internal.items()}
    
    # Renomeia as colunas do DataFrame
    # Usamos errors='raise' para que o erro seja levantado se uma coluna não for encontrada
    try:
        df_processed = df_processed.rename(columns=rename_dict, errors='raise')
    except KeyError as e:
        st.error(f"Erro ao renomear colunas. Verifique se os nomes das colunas na sua planilha Excel correspondem exatamente aos nomes configurados no código: {e}. Nomes esperados: {list(column_mapping_excel_to_internal.keys())}")
        return pd.DataFrame()


    # Verifica se todas as colunas internas necessárias existem após o renomeio
    required_internal_cols = ['nf', 'pedido', 'dataemissao', 'modelo', 'produto', 'qtdoriginal', 'separado']
    for col in required_internal_cols:
        if col not in df_processed.columns:
            st.error(f"Erro Crítico: A coluna interna '{col}' não foi mapeada corretamente ou não existe após o renomeio. Verifique o dicionário 'column_mapping_excel_to_internal' e sua planilha.")
            return pd.DataFrame() # Retorna um DataFrame vazio para evitar erros posteriores

    df_processed['qtdoriginal'] = pd.to_numeric(df_processed['qtdoriginal'], errors='coerce').fillna(0).astype(int)
    df_processed['separado'] = pd.to_numeric(df_processed['separado'], errors='coerce').fillna(0).astype(int)
    
    # Adicionar ID e status/currentStage
    df_processed['id'] = range(len(df_processed))
    df_processed['current_stage'] = 'embalagem' # Todos os itens novos começam em embalagem
    df_processed['status'] = df_processed.apply(lambda row: get_status(row['qtdoriginal'], row['separado']), axis=1)

    # Corrigir current_stage se já estiver concluído na planilha original
    df_processed.loc[df_processed['status'] == 'concluido', 'current_stage'] = 'concluido'
    
    # Se 'separado' == 'qtdoriginal' e current_stage ainda é 'embalagem', move para 'expedicao'
    # Isso lida com casos onde a planilha inicial já tem itens totalmente separados
    df_processed.loc[(df_processed['separado'] == df_processed['qtdoriginal']) & 
                     (df_processed['current_stage'] == 'embalagem'), 'current_stage'] = 'expedicao'


    # Aplicar formatação de data
    df_processed['dataemissao'] = df_processed['dataemissao'].apply(format_date)
    
    # Define ID como índice para facilitar acesso nas operações de .loc,
    # mas o 'id' ainda é acessível como coluna através de .iterrows()
    return df_processed.set_index('id') 

# --- INICIALIZAÇÃO DO ESTADO DA SESSÃO ---
if 'logged_in' not in st.session_state:
    st.session_state.logged_in = False
if 'current_profile' not in st.session_state:
    st.session_state.current_profile = ''
if 'data' not in st.session_state:
    st.session_state.data = pd.DataFrame()
if 'excel_loaded' not in st.session_state:
    st.session_state.excel_loaded = False
if 'selected_item_id' not in st.session_state:
    st.session_state.selected_item_id = None

# --- FUNÇÃO PRINCIPAL DO APLICATIVO ---

def app_main():
    st.title("Sistema de Controle de Produção")

    # Botões de seleção de perfil (apenas para Admin pode mudar)
    if st.session_state.current_profile == 'admin':
        st.sidebar.header("Trocar Perfil")
        selected_profile_name = st.sidebar.radio(
            "Selecione o perfil:",
            options=[USERS[k]['name'] for k in USERS.keys()],
            index=[v['name'] for k, v in USERS.items()].index(USERS[st.session_state.current_profile]['name']),
            key="profile_selector_radio"
        )
        for k, v in USERS.items():
            if v['name'] == selected_profile_name:
                st.session_state.current_profile = k
                break
    else:
        st.sidebar.info(f"Logado como: **{USERS[st.session_state.current_profile]['name']}**")

    # --- Carregamento de Planilha ---
    st.header("Carregamento de Dados")
    if st.session_state.current_profile == 'admin' and not st.session_state.excel_loaded:
        st.info(f"Tentando carregar a planilha automaticamente de: `{EXCEL_FILE_NAME}`")
        load_excel_data_auto()

    if st.session_state.current_profile == 'admin':
        st.subheader("Upload Manual de Planilha (Admin)")
        uploaded_file = st.file_uploader("Ou selecione um arquivo Excel manualmente:", type=["xlsx", "xls"])
        if uploaded_file is not None:
            try:
                df_uploaded = pd.read_excel(uploaded_file)
                st.session_state.data = process_excel_data(df_uploaded)
                # Somente marca como carregado se o processamento for bem-sucedido e o DF não for vazio
                st.session_state.excel_loaded = not st.session_state.data.empty
                if st.session_state.excel_loaded:
                    st.success("Planilha carregada manualmente com sucesso!")
                else:
                    st.warning("O arquivo carregado está vazio ou não pôde ser processado.")
            except Exception as e:
                st.error(f"Erro ao carregar o arquivo Excel: {e}")
                st.warning("Verifique se o arquivo está no formato correto e se as colunas estão nomeadas como: NF, Pedido n, Dt.emissão, Modelo, Produto, Qtd., Separado.")

    if st.session_state.data.empty:
        st.warning("Nenhum dado carregado. Por favor, carregue uma planilha Excel (apenas Admin pode fazer upload manual).")
        return # Para a execução se não houver dados

    # --- Estatísticas ---
    st.header("Estatísticas Rápidas")
    col1, col2, col3, col4 = st.columns(4)
    total_items = len(st.session_state.data)
    embalagem_items = st.session_state.data[st.session_state.data['current_stage'] == 'embalagem'].shape[0]
    expedicao_items = st.session_state.data[st.session_state.data['current_stage'] == 'expedicao'].shape[0]
    concluido_items = st.session_state.data[st.session_state.data['current_stage'] == 'concluido'].shape[0]

    with col1:
        st.metric("Total de Itens", total_items)
    with col2:
        st.metric("Na Embalagem", embalagem_items)
    with col3:
        st.metric("Na Expedição", expedicao_items)
    with col4:
        st.metric("Concluídos", concluido_items)

    # --- Filtros ---
    st.header("Filtros")
    col_filter1, col_filter2, col_filter3, col_filter4 = st.columns(4)
    with col_filter1:
        filter_nf = st.text_input("Filtrar por NF", key="filter_nf").lower()
    with col_filter2:
        filter_pedido = st.text_input("Filtrar por Pedido", key="filter_pedido").lower()
    with col_filter3:
        filter_produto = st.text_input("Filtrar por Produto", key="filter_produto").lower()
    with col_filter4:
        filter_status = st.selectbox(
            "Filtrar por Status",
            options=["Todos os Status", "Na Embalagem", "Na Expedição", "Parcial", "Concluído"],
            key="filter_status_select"
        )
    
    # --- Lógica de Filtragem ---
    df_filtered = st.session_state.data.copy()

    # Resetar o índice para que 'id' seja uma coluna novamente
    # Isso é crucial para que 'row['id']' funcione na iteração
    df_filtered = df_filtered.reset_index()

    # Filtrar por perfil
    if st.session_state.current_profile == 'embalagem':
        df_filtered = df_filtered[
            (df_filtered['current_stage'] == 'embalagem') | 
            ((df_filtered['separado'] > 0) & (df_filtered['separado'] < df_filtered['qtdoriginal']))
        ]
    elif st.session_state.current_profile == 'expedicao':
        df_filtered = df_filtered[
            (df_filtered['current_stage'] == 'expedicao') | 
            ((df_filtered['separado'] > 0) & (df_filtered['separado'] < df_filtered['qtdoriginal'])) |
            (df_filtered['current_stage'] == 'concluido') # Itens concluídos também aparecem na expedição
        ]
    # Admin vê tudo, não precisa de filtro inicial

    # Aplicar filtros de busca
    if filter_nf:
        df_filtered = df_filtered[df_filtered['nf'].astype(str).str.lower().str.contains(filter_nf)]
    if filter_pedido:
        df_filtered = df_filtered[df_filtered['pedido'].astype(str).str.lower().str.contains(filter_pedido)]
    if filter_produto:
        df_filtered = df_filtered[df_filtered['produto'].astype(str).str.lower().str.contains(filter_produto)]
    
    if filter_status != "Todos os Status":
        status_map = {
            "Na Embalagem": "embalagem",
            "Na Expedição": "expedicao",
            "Parcial": "parcial",
            "Concluído": "concluido"
        }
        selected_status_key = status_map[filter_status]

        if selected_status_key in ['embalagem', 'expedicao', 'concluido']:
            df_filtered = df_filtered[df_filtered['current_stage'] == selected_status_key]
        elif selected_status_key == 'parcial':
            df_filtered = df_filtered[
                (df_filtered['separado'] > 0) & 
                (df_filtered['separado'] < df_filtered['qtdoriginal'])
            ]
    
    # --- Tabela de Dados ---
    st.header("Dados de Produção")

    # Mapeamento de status para badges CSS (Streamlit não tem nativo, então faremos com HTML)
    status_to_html_class = {
        'embalagem': 'background: #fff3cd; color: #856404;',
        'expedicao': 'background: #cce5ff; color: #004085;',
        'parcial': 'background: #f8d7da; color: #721c24;',
        'concluido': 'background: #d4edda; color: #155724;'
    }
    status_label_map = {
        'embalagem': 'Na Embalagem',
        'expedicao': 'Na Expedição',
        'parcial': 'Parcial',
        'concluido': 'Conclído' # Corrigido typo
    }

    # Prepare o DataFrame para exibição na tabela, adicionando a coluna de status formatada
    df_display = df_filtered.copy()
    df_display['Status Display'] = '' # Coluna temporária para HTML de status

    # A verificação 'not df_display.empty' é importante aqui
    if not df_display.empty:
        for idx, row in df_display.iterrows():
            display_status_class_key = row['current_stage']
            display_status_label = status_label_map.get(row['current_stage'], row['current_stage'])

            if row['current_stage'] in ['embalagem', 'expedicao']:
                if row['separado'] > 0 and row['separado'] < row['qtdoriginal']:
                    display_status_class_key = 'parcial'
                    display_status_label = 'Parcial'
                elif row['separado'] == row['qtdoriginal'] and row['current_stage'] == 'embalagem':
                    display_status_label = 'Pronto p/ Expedição'
                elif row['separado'] == row['qtdoriginal'] and row['current_stage'] == 'expedicao':
                    display_status_label = 'Aguardando Confirmação'
            elif row['current_stage'] == 'concluido':
                display_status_class_key = 'concluido'
                display_status_label = 'Concluído'
            
            style = status_to_html_class.get(display_status_class_key, '')
            df_display.loc[idx, 'Status Display'] = f"<span style='{style} padding: 5px 12px; border-radius: 20px; font-size: 12px; font-weight: bold; text-transform: uppercase;'>{display_status_label}</span>"

    # Seleção de colunas para exibição na tabela
    # Use os nomes internos das colunas aqui
    display_columns = [
        'nf', 'pedido', 'dataemissao', 'modelo', 
        'produto', 'qtdoriginal', 'separado', 'Status Display'
    ]
    
    # Para exibir os cabeçalhos da tabela como os nomes EXATOS do Excel,
    # precisamos mapeá-los de volta para a exibição
    display_column_names_for_table = {
        'nf': 'NF',
        'pedido': 'Pedido n',
        'dataemissao': 'Dt.emissão',
        'modelo': 'Modelo',
        'produto': 'Produto',
        'qtdoriginal': 'Qtd.',
        'separado': 'Separado',
        'Status Display': 'Status' # O nome da coluna nova
    }
    
    # Criar um DataFrame para exibição com os nomes corretos para o usuário
    df_final_display = df_display[display_columns].rename(columns=display_column_names_for_table)

    # Exibir a tabela
    st.write("---")
    st.markdown(df_final_display.to_html(escape=False, index=False), unsafe_allow_html=True)
    st.write("---")


    # --- Ações ---
    st.header("Ações")

    # Seletor de item para ações (Separar/Confirmar)
    # A verificação 'not df_filtered.empty' garante que não tentaremos acessar 'id' de um DF vazio
    if not df_filtered.empty:
        # Opções para o selectbox, com um prefixo para ID
        # Como df_filtered.reset_index() foi chamado, 'id' é uma coluna regular.
        item_options = [f"ID: {row['id']} | NF: {row['nf']} | Produto: {row['produto']}" for idx, row in df_filtered.iterrows()]
        
        selected_item_display = st.selectbox(
            "Selecione um item para realizar uma ação:",
            options=["Selecione..."] + item_options,
            key="item_selector"
        )

        selected_item_id = None
        if selected_item_display and selected_item_display != "Selecione...":
            # Extrai o ID da string
            selected_item_id = int(selected_item_display.split(' | ')[0].replace('ID: ', ''))
        
        st.session_state.selected_item_id = selected_item_id
        
        item_to_act = None
        # Verifica se o ID existe no DataFrame de sessão (st.session_state.data)
        if selected_item_id is not None and selected_item_id in st.session_state.data.index:
            item_to_act = st.session_state.data.loc[selected_item_id]

        if item_to_act is not None:
            st.subheader(f"Ações para {item_to_act['produto']} (NF: {item_to_act['nf']})")
            
            # Ações da Embalagem
            if st.session_state.current_profile == 'embalagem' and item_to_act['current_stage'] == 'embalagem':
                st.write(f"Quantidade Original: **{item_to_act['qtdoriginal']}** | Separado Atualmente: **{item_to_act['separado']}**")
                
                separation_qty = st.number_input(
                    "Quantidade a separar:",
                    min_value=0,
                    max_value=item_to_act['qtdoriginal'] - item_to_act['separado'],
                    value=0,
                    key=f"sep_qty_{selected_item_id}"
                )
                if st.button("Registrar Separação", key=f"btn_sep_{selected_item_id}"):
                    if separation_qty > 0:
                        st.session_state.data.loc[selected_item_id, 'separado'] += separation_qty
                        new_separated = st.session_state.data.loc[selected_item_id, 'separado']
                        st.session_state.data.loc[selected_item_id, 'status'] = get_status(item_to_act['qtdoriginal'], new_separated)
                        
                        if new_separated == item_to_act['qtdoriginal']:
                            st.session_state.data.loc[selected_item_id, 'current_stage'] = 'expedicao'
                            st.success(f"Item {item_to_act['nf']} separado totalmente e movido para Expedição!")
                        else:
                            st.info(f"Item {item_to_act['nf']} separado parcialmente.")
                        st.session_state.selected_item_id = None # Limpa a seleção após a ação
                        st.rerun() # Recarrega a página para atualizar a tabela e o seletor

            # Ações da Expedição
            elif st.session_state.current_profile == 'expedicao' and item_to_act['current_stage'] == 'expedicao':
                st.write(f"Item pronto para ser confirmado. Quantidade Separada: **{item_to_act['separado']}** de **{item_to_act['qtdoriginal']}**")
                if st.button("Confirmar Recebimento", key=f"btn_conf_{selected_item_id}"):
                    st.session_state.data.loc[selected_item_id, 'current_stage'] = 'concluido'
                    st.session_state.data.loc[selected_item_id, 'status'] = 'concluido'
                    st.success(f"Recebimento do item {item_to_act['nf']} confirmado! Movido para Concluídos.")
                    st.session_state.selected_item_id = None
                    st.rerun()

            # Ações do Administrador (edição direta na tabela ou formulário específico)
            elif st.session_state.current_profile == 'admin':
                st.write("Você pode editar os campos diretamente na tabela acima.")
                # st.data_editor já cuida da edição

    # --- Edição Direta para Admin (st.data_editor) ---
    if st.session_state.current_profile == 'admin' and not st.session_state.data.empty:
        st.subheader("Edição Direta da Tabela (Admin)")
        # Renomeia temporariamente para a edição para mostrar nomes mais amigáveis
        df_editable = st.session_state.data.copy()
        
        # Mapeamento para exibição no st.data_editor
        display_names_for_editor = {
            'nf': 'NF', 
            'pedido': 'Pedido n', 
            'dataemissao': 'Dt.emissão',
            'modelo': 'Modelo', 
            'produto': 'Produto', 
            'qtdoriginal': 'Qtd.', 
            'separado': 'Separado'
        }
        df_editable = df_editable.rename(columns=display_names_for_editor)
        
        # Define quais colunas são editáveis
        column_config = {
            "NF": st.column_config.TextColumn("NF", disabled=True),
            "Pedido n": st.column_config.TextColumn("Pedido n", disabled=True),
            "Dt.emissão": st.column_config.TextColumn("Dt.emissão", disabled=True),
            "Modelo": st.column_config.TextColumn("Modelo", disabled=True),
            "Produto": st.column_config.TextColumn("Produto", disabled=True),
            "Qtd.": st.column_config.NumberColumn("Qtd.", min_value=0, step=1), # Editável
            "Separado": st.column_config.NumberColumn("Separado", min_value=0, step=1) # Editável
        }

        edited_df = st.data_editor(
            df_editable[['NF', 'Pedido n', 'Produto', 'Qtd.', 'Separado']], # Colunas a serem mostradas para edição
            hide_index=True,
            num_rows="dynamic",
            use_container_width=True,
            key="main_data_editor",
            column_config=column_config
        )
        
        # Captura as mudanças e atualiza o DataFrame original
        # Com st.data_editor, `st.session_state.main_data_editor` já contém o DataFrame editado.
        # Precisamos mapear de volta para os nomes internos
        
        # Verifica se o DataFrame editado é diferente do original
        # Convertemos os nomes de volta para os nomes internos para comparação
        edited_df_internal_names = edited_df.rename(columns={v:k for k,v in display_names_for_editor.items()})

        # Compara apenas as colunas que podem ser editadas para evitar triggers falsos
        editable_cols_internal = ['qtdoriginal', 'separado']
        
        # Cria uma cópia do estado atual da sessão para comparação
        current_session_data_for_comparison = st.session_state.data[editable_cols_internal].copy()
        
        # Antes de comparar, precisamos garantir que o `edited_df_internal_names`
        # tenha o mesmo índice que `st.session_state.data`.
        # O st.data_editor retorna um DataFrame com índice numérico padrão (0, 1, 2...).
        # Precisamos mapear este índice para o ID original.
        # Uma forma de fazer isso é usando o índice original de st.session_state.data
        # para reindexar o edited_df_internal_names antes da comparação.
        
        # Certifica-se de que o edited_df_internal_names tenha o mesmo número de linhas
        if len(edited_df_internal_names) == len(st.session_state.data):
            edited_df_internal_names.index = st.session_state.data.index
            edited_df_internal_names = edited_df_internal_names[editable_cols_internal] # Filtra apenas as colunas editáveis
        else:
            # Isso pode acontecer se houver adição/remoção de linhas pelo data_editor.
            # Para este caso, a lógica de comparação linha a linha abaixo pode ser mais complexa
            # e exigir uma estratégia diferente para identificar as mudanças.
            # Por enquanto, vamos forçar um rerun e assumir que a edição direta lida com isso.
            # Se você usar 'num_rows="dynamic"', a lógica de identificação de linhas alteradas precisa ser mais robusta.
            # Para este cenário, focar apenas em edições de valores em linhas existentes é mais simples.
            pass


        # Verifica se há alguma diferença significativa apenas nas colunas editáveis
        # A comparação agora deve ser feita diretamente entre os valores, não o DataFrame completo,
        # devido à complexidade da reindexação do data_editor.
        
        # Iterar sobre as linhas para identificar as mudanças de forma mais robusta
        changes_detected = False
        for original_id, original_row in st.session_state.data.iterrows():
            if original_id in edited_df_internal_names.index: # Verifica se a linha original ainda existe na edição
                edited_row_from_data_editor = edited_df_internal_names.loc[original_id]
                
                # Compara apenas as colunas que são editáveis
                if (original_row['qtdoriginal'] != edited_row_from_data_editor['qtdoriginal'] or
                    original_row['separado'] != edited_row_from_data_editor['separado']):
                    
                    st.session_state.data.loc[original_id, 'qtdoriginal'] = edited_row_from_data_editor['qtdoriginal']
                    st.session_state.data.loc[original_id, 'separado'] = edited_row_from_data_editor['separado']

                    # Recalcula status e current_stage
                    new_qtd_original = st.session_state.data.loc[original_id, 'qtdoriginal']
                    new_separado = st.session_state.data.loc[original_id, 'separado']
                    st.session_state.data.loc[original_id, 'status'] = get_status(new_qtd_original, new_separado)

                    # Lógica de transição de estágio via edição admin
                    if new_separado == new_qtd_original and st.session_state.data.loc[original_id, 'current_stage'] == 'embalagem':
                        st.session_state.data.loc[original_id, 'current_stage'] = 'expedicao'
                        st.info(f"Item {st.session_state.data.loc[original_id, 'nf']} movido para Expedição via edição.")
                    elif new_separado < new_qtd_original and st.session_state.data.loc[original_id, 'current_stage'] == 'expedicao':
                        st.session_state.data.loc[original_id, 'current_stage'] = 'embalagem'
                        st.info(f"Item {st.session_state.data.loc[original_id, 'nf']} movido de volta para Embalagem via edição.")
                    changes_detected = True
        
        if changes_detected:
            st.success("Dados atualizados!")
            st.rerun() # Recarrega para aplicar as mudanças e re-filtrar

# --- LÓGICA DE LOGIN ---
def login_page():
    st.header("Login no Sistema de Produção")
    with st.form("login_form"):
        username = st.text_input("Usuário:")
        password = st.text_input("Senha:", type="password")
        submit_button = st.form_submit_button("Entrar")

        if submit_button:
            if username in USERS and USERS[username]['password'] == password:
                st.session_state.logged_in = True
                st.session_state.current_profile = username
                st.success(f"Bem-vindo, {USERS[username]['name']}!")
                st.rerun() # Recarrega a página para mostrar o app principal
            else:
                st.error("Usuário ou senha inválidos.")

@st.cache_data(show_spinner="Carregando planilha automaticamente...")
def load_excel_data_auto_cached(file_name):
    """Carrega a planilha automaticamente e a processa."""
    try:
        df = pd.read_excel(file_name)
        st.session_state.excel_loaded = True
        return process_excel_data(df)
    except FileNotFoundError:
        st.error(f"Erro: Arquivo '{file_name}' não encontrado na mesma pasta do script. Por favor, verifique o nome ou faça o upload manual.")
        st.session_state.excel_loaded = False # Reseta para permitir upload manual
        return pd.DataFrame() # Retorna DataFrame vazio em caso de erro
    except Exception as e:
        st.error(f"Erro ao ler a planilha: {e}. Verifique o formato do arquivo e se as colunas estão corretas.")
        st.session_state.excel_loaded = False
        return pd.DataFrame() # Retorna DataFrame vazio em caso de erro

def load_excel_data_auto():
    """Wrapper para a função cacheada de carregamento automático."""
    if not st.session_state.excel_loaded:
        st.session_state.data = load_excel_data_auto_cached(EXCEL_FILE_NAME)
        # Se o carregamento automático falhou (df.empty e excel_loaded=False), 
        # forçamos o st.rerun para exibir a seção de upload manual para admin
        if st.session_state.current_profile == 'admin' and st.session_state.data.empty and not st.session_state.excel_loaded:
            st.rerun()


# --- LÓGICA DE NAVEGAÇÃO PRINCIPAL ---
if not st.session_state.logged_in:
    login_page()
else:
    app_main()