# Colheita Sombria 🌾🎃

Jogo de terror **assimétrico** para Roblox (1 assassino contra vários sobreviventes),
no estilo de jogos como Forsaken, com personagem, mapas e nomes próprios.

O assassino é **O Espantalho**: saco de estopa na cabeça, olhos vermelhos, chapéu de palha e forcado.

## Como abrir no Roblox Studio

### Opção 1: arquivo pronto (mais fácil)
1. Baixe o arquivo **`ColheitaSombria.rbxlx`** desta pasta.
2. Dê dois cliques nele (ou, no Studio, use **Arquivo → Abrir do arquivo**).
3. Aperte **Play**. O lobby, os mapas e o resto são criados por código quando o jogo inicia.

> Dica: em **Lighting → Technology**, escolha **Future** para as luzes e sombras ficarem mais bonitas.

### Opção 2: Rojo (para quem programa)
```bash
rojo serve        # sincroniza com o Studio
rojo build -o ColheitaSombria.rbxlx
```
Sem o Rojo, `node build-place.mjs` gera o mesmo `.rbxlx`.

## O que tem no jogo

### Lobby (onde o jogador nasce)
- **Cercado de grades de ferro** enferrujado, com pilares de pedra, lanternas e um portão trancado com corrente.
- **Paredes invisíveis** (e um teto invisível) em volta do cercado: ninguém sai nem pula por cima da grade.
- **Do lado de fora** fica o cenário de campo, só de enfeite: campo de trigo, celeiro vermelho, silos,
  moinho girando, casa da fazenda com janelas acesas, trator, poço, plantação de abóboras,
  milharal com espantalhos, pomar de árvores mortas e uma capela com túmulos lá no fundo.
- Noite com neblina e luzes que piscam sozinhas.

### Votação de mapa (30 s entre as partidas)
- O jogador nasce **olhando para 4 quadrados**. Cada quadrado tem uma placa com um mapa.
- **Para votar, é só pisar no quadrado.** O voto vale até você pisar em outro.
- A cada votação, 4 mapas são sorteados entre os 6 existentes.
- Depois de **30 segundos**, o mapa mais votado é escolhido (empate é sorteado).

### Mapas (gerados com variações a cada partida)
| Mapa | Destaque |
|---|---|
| Milharal Maldito | Labirinto de milho diferente a cada partida |
| Celeiro Abandonado | Celeiro enorme com palheiro, silos e currais |
| Vila Esquecida | Casas vazias com duas portas, ruas de pedra |
| Cemitério da Capela | Túmulos, mausoléus e uma capela com campanário |
| Floresta Sussurrante | Floresta densa, cabana, fogueira e lago |
| Moinho Velho | Colina com moinho, rio com pontes e abóboras |

### Partida
- Um jogador é sorteado para ser **O Espantalho**. Quem não foi assassino ganha mais chance na próxima
  (a chance aparece na tela durante a votação).
- O Espantalho fica **preso por 8 segundos** no começo.
- **Sobreviventes vencem** se aguentarem até o relógio zerar (3 minutos).
  Cada **gerador consertado tira 20 segundos** do relógio.
- **O Espantalho vence** se pegar todo mundo.
- Quem morre volta para o lobby e pode **assistir** a partida.
- Jogando sozinho, um **Espantalho controlado pelo computador** entra na partida.

### Controles
| Sobrevivente | Espantalho |
|---|---|
| **Shift**: correr (gasta estamina) | **Clique / F**: golpe de forcado |
| **E** (segurar): consertar gerador | **Q**: Uivo (vê todos os sobreviventes através das paredes) |
| **Q**: Lanterna (cega o Espantalho por 2,5 s se ele estiver perto e na sua frente) | **E**: Investida (corre muito por 1,4 s) |

No celular e no controle aparecem botões na tela.

## Onde mexer

| Arquivo | Para que serve |
|---|---|
| `src/shared/Config.luau` | **Todos os números do jogo**: tempo de votação, duração, velocidades, dano, recargas, sons |
| `src/server/Modules/Lobby.luau` | Cercado, paredes invisíveis, quadrados de votação e cenário da fazenda |
| `src/server/Modules/Maps.luau` | Os 6 mapas (para criar um novo, copie uma entrada de `Maps.List`) |
| `src/server/Modules/RoundManager.luau` | Ciclo: votação → partida → resultado → votação |
| `src/server/Modules/Roles.luau` | Sobrevivente x assassino, habilidades e visual do Espantalho |
| `src/server/Modules/Generators.luau` | Geradores |
| `src/server/Modules/KillerBot.luau` | Espantalho controlado pelo computador |
| `src/server/Modules/Build.luau` | Peças de cenário (celeiro, cerca, grade, árvore, abóbora, túmulo...) |
| `src/client/` | Interface, controles, luzes piscando e vinheta do "raio de terror" |

### Sons
Por padrão, o jogo só usa sons que já vêm com o Roblox. Para colocar música ambiente e música de
perseguição, coloque IDs de áudio do seu inventário em `Config.Sounds` (ex.: `"rbxassetid://123456"`).

Depois de editar os arquivos em `src/`, rode `node build-place.mjs` para gerar o `.rbxlx` de novo.
