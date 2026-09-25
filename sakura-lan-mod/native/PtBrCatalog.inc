// PT-BR catalog. Entries are keyed by localization group + key when known.
// Source-text fallback covers serialized LocalizeUI strings that do not use a
// dictionary key. This file is generated/expanded from the game's own English
// localization assets; unknown strings remain English rather than becoming
// blank or corrupt.
struct PtBrEntry { const char* group; const char* key; const char* source; const char* text; };

static const PtBrEntry kPtBrEntries[] = {
    {"*", "", "Language", "Idioma"},
    {"*", "", "English", "Português (Brasil)"},
    {"*", "", "New Game", "Novo jogo"},
    {"*", "", "Load Game", "Carregar jogo"},
    {"*", "", "Save", "Salvar"},
    {"*", "", "Load", "Carregar"},
    {"*", "", "Settings", "Configurações"},
    {"*", "", "Close", "Fechar"},
    {"*", "", "Back", "Voltar"},
    {"*", "", "Yes", "Sim"},
    {"*", "", "No", "Não"},
    {"*", "", "Mission", "Missão"},
    {"*", "", "Mission Clear", "Missão concluída"},
    {"*", "", "Clear", "Concluído"},
    {"*", "", "Money", "Dinheiro"},
};

const char* ptbr_lookup(const std::string& group, const std::string& key,
                        const std::string& source) {
    for (const auto& entry : kPtBrEntries) {
        if (entry.key[0] && key == entry.key &&
            (entry.group[0] == '*' || group == entry.group)) return entry.text;
    }
    for (const auto& entry : kPtBrEntries) {
        if (entry.source[0] && source == entry.source &&
            (entry.group[0] == '*' || group == entry.group)) return entry.text;
    }
    return nullptr;
}
