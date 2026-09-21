# Sistema de Pedidos para Restaurante — Offline-First PWA (MVP)

Data: 2026-09-21
Status: Aprovado (autoaprovado pelo usuário — execução autônoma solicitada)

## 1. Problema

Restaurante precisa de um sistema de pedidos (tipo PDV/comandas) que:
- Funcione com internet.
- Continue funcionando sem internet.
- Continue acessível mesmo se o computador do caixa quebrar/desligar — outro dispositivo (celular de um garçom, por exemplo) deve conseguir assumir a operação sem downtime.

## 2. Decisão de arquitetura

**PWA offline-first** em Next.js, com Postgres na nuvem como fonte de verdade e cache local (IndexedDB) em cada dispositivo. Todo dispositivo (PC do caixa, celular de garçom, tablet de cozinha) roda o mesmo app web, instalável via "Adicionar à tela inicial". Não existe dispositivo especial/mestre: qualquer navegador logado com o PIN do restaurante é um terminal completo.

### Por que essa opção (vs. alternativas consideradas)

| Opção | Motivo de rejeição |
|---|---|
| Servidor local na rede (Raspberry Pi/mini-PC) | Adiciona hardware dedicado e ponto único de falha física — exatamente o problema que o requisito pede pra evitar. Mais complexo de implantar/manter para um MVP. |
| App nativo (React Native) | Fricção de loja de app, build/distribuição mais lenta. PWA instalável no navegador do celular atende "acessar pelo celular" sem esse custo. |
| **PWA offline-first + Postgres cloud (escolhida)** | Um único código-fonte, deploy único na Vercel, qualquer navegador é um terminal, funciona offline via cache local, sincroniza quando a rede volta. |

### Como resolve os dois cenários de indisponibilidade

- **Sem internet no restaurante inteiro**: cada dispositivo já tem o app (service worker) e os dados recentes (IndexedDB) em cache. Pedidos continuam sendo criados/editados localmente, fila de mutações pendentes é sincronizada quando a conexão volta.
- **Caixa quebra**: como não há estado que exista só na máquina do caixa (tudo sincroniza para o Postgres central quando online, e cada dispositivo tem seu próprio cache local), um garçom abre o mesmo app no celular e continua operando. Se o caixa quebrou mas a internet está de pé, o celular puxa o estado mais recente do servidor. Se caixa e internet caem juntos, o celular opera com o cache local que já tinha (pode estar levemente desatualizado, mas funcional).

## 3. Escopo do MVP

**Dentro do escopo:**
- Login simples por PIN do restaurante + seleção de nome do funcionário (sem senha complexa — uso compartilhado em ambiente de restaurante). PIN cacheado localmente após primeiro login online, permitindo login offline.
- Cardápio: categorias e itens (nome, preço, disponível/indisponível).
- Comandas: abrir pedido por mesa ou balcão, adicionar/remover itens, observações simples.
- Status do pedido: aberto → em preparo → pronto → entregue → pago.
- Tela de cozinha: lista de pedidos abertos/em preparo, marcar item/pedido como pronto.
- Fechamento de conta: marcar como pago, forma de pagamento (dinheiro/cartão/pix) — apenas registro, sem gateway de pagamento real.
- Funcionamento offline completo do fluxo acima (criar/editar pedido, mudar status) com sincronização automática ao reconectar.

**Fora do escopo (explicitamente):**
- Processamento real de pagamento (Stripe/gateway) — apenas registro do método.
- Integração com impressora fiscal/cupom.
- Multi-tenant (múltiplos restaurantes na mesma instância) — MVP é single-tenant.
- Permissões granulares por cargo — só "funcionário" vs "admin" (admin edita cardápio).
- Resolução de conflito sofisticada (CRDT). Usamos last-write-wins por timestamp em nível de item de pedido — limite conhecido, aceitável pra escala de um restaurante pequeno/médio onde dois dispositivos raramente editam o mesmo pedido ao mesmo tempo.
- Gestão de estoque/insumos.

## 4. Modelo de dados (Postgres)

- `restaurant` (id, nome, pin_hash)
- `staff` (id, restaurant_id, nome)
- `menu_category` (id, restaurant_id, nome, ordem)
- `menu_item` (id, category_id, nome, preco_centavos, disponivel)
- `order` (id, restaurant_id, mesa_ou_balcao, status, criado_por_staff_id, criado_em, atualizado_em, device_id)
- `order_item` (id, order_id, menu_item_id, quantidade, observacao, status, atualizado_em)
- `payment` (id, order_id, metodo, valor_centavos, criado_em)

`atualizado_em` em `order` e `order_item` é o timestamp usado para last-write-wins na sincronização.

## 5. Mecânica de sincronização offline

1. Toda escrita (criar pedido, adicionar item, mudar status, pagar) grava primeiro no IndexedDB local (otimista, UI atualiza na hora) e entra numa fila de mutações pendentes.
2. Um worker de sincronização (dispara ao voltar `online` e periodicamente) envia a fila para a API (`/api/sync`), em ordem.
3. Servidor aplica cada mutação: se `atualizado_em` da mutação for mais recente que o registro atual, aplica; senão, descarta (last-write-wins) e devolve o estado atual pro cliente reconciliar.
4. Cliente também faz *pull* periódico (ou via realtime quando implementado) do estado do restaurante para manter o cache atualizado quando outro dispositivo alterou algo.
5. Service worker cacheia o app shell (HTML/JS/CSS) via Workbox para o app abrir mesmo 100% offline.

## 6. Stack técnica

- Next.js (App Router) na Vercel, Fluid Compute.
- Postgres via Vercel Marketplace (Neon).
- IndexedDB via `idb` no cliente.
- Service worker via `next-pwa`/Workbox para cache de app shell + estratégia de rede.
- Sem dependência de gateway de pagamento nem autenticação de terceiros no MVP (login por PIN próprio).

## 7. Testes

- Testes automatizados (unitários) para: fila de mutações, resolução last-write-wins, transições de status de pedido.
- Teste end-to-end manual via deploy preview na Vercel, usando navegador automatizado (Chrome) para validar: login, criar comanda, adicionar item, ver na tela de cozinha, marcar pronto, fechar conta — incluindo simulação de modo offline (DevTools offline) e reconexão.

## 8. Critério de pronto (MVP)

- Fluxo completo (login → comanda → cozinha → pagamento) funciona 100% com internet.
- Mesmo fluxo funciona com o dispositivo em modo offline (network throttling/offline no DevTools), com sincronização correta ao reconectar.
- Dois dispositivos distintos (simulando caixa + celular) veem o mesmo estado de pedidos após sincronizar.
- Deploy funcional na Vercel (preview ou produção).
