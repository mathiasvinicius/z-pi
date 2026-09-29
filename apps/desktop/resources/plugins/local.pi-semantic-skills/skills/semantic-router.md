---
name: semantic-skills
description: Use para descobrir por intenção as skills deste perfil e aproveitar procedimentos já aprendidos antes de executar tarefas; após um sucesso reutilizável, evolua a skill correspondente.
---

# Skills semânticas deste perfil

Antes de executar uma tarefa que pode ter um procedimento reutilizável, chame
`semantic_skills_find` com a intenção completa do usuário. Leia as instruções
somente da skill mais pertinente com `semantic_skills_read`, usando o `id`
retornado pela busca. Leia skills relacionadas apenas se a tarefa precisar
delas; não carregue todas antecipadamente nem use o carregador nativo de
skills para estas mesmas instruções. A busca
consulta somente a instalação atual; nunca misture perfis nem trate skills
de outro usuário como disponíveis.

Depois de concluir e **verificar** uma tarefa reutilizável, chame
`semantic_skills_learn` com um nome curto, a finalidade, os passos realmente
funcionais e uma evidência não secreta do sucesso. Esse registro cria uma skill
somente se não houver outra para o mesmo objetivo; se uma skill aprendida já
existir, ela será melhorada no mesmo arquivo. Não registre tentativas, erros,
segredos, tokens, dados pessoais ou uma ação sem procedimento repetível.

Uma skill antiga não gerenciada pelo plugin nunca é sobrescrita. Se a ferramenta
informar conflito ou revisão necessária, explique isso ao usuário sem criar
outro arquivo à força.
