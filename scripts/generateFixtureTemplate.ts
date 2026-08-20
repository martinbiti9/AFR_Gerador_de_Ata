import fs from 'fs';
import path from 'path';
import PizZip from 'pizzip';

const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`;

const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const wordRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/>
        <w:sz w:val="20"/>
      </w:rPr>
    </w:rPrDefault>
  </w:docDefaults>
</w:styles>`;

const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:pPr><w:jc w:val="center"/></w:pPr>
      <w:r><w:rPr><w:b/><w:sz w:val="28"/></w:rPr><w:t>AFONSO FRANÇA ENGENHARIA</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr><w:jc w:val="center"/></w:pPr>
      <w:r><w:rPr><w:b/><w:sz w:val="24"/></w:rPr><w:t>ATA DE REUNIÃO DE NEGOCIAÇÃO DE SUPRIMENTOS</w:t></w:r>
    </w:p>
    <w:p><w:r><w:t></w:t></w:r></w:p>

    <!-- TABELA 1: CABEÇALHO / DADOS GERAIS DA OBRA E FORNECEDOR -->
    <w:tbl>
      <w:tblPr><w:tblW w:w="0" w:type="auto"/></w:tblPr>
      <w:tr>
        <w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Obra / Código:</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>[CÓDIGO DA OBRA] - [NOME DA OBRA]</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Fornecedor / Razão Social:</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>[FORNECEDOR]</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Assunto:</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>[ASSUNTO]</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Pacote / Serviço:</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>[SERVIÇO]</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Requisição / Cotação:</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>RM XXX COT XXX</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Link da Gravação / Rede:</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>[caminho da rede]</w:t></w:r></w:p></w:tc>
      </w:tr>
    </w:tbl>

    <w:p><w:r><w:t></w:t></w:r></w:p>

    <!-- TABELA 2: LISTA DE PARTICIPANTES E PRESENÇA -->
    <w:tbl>
      <w:tblPr><w:tblW w:w="0" w:type="auto"/></w:tblPr>
      <w:tr>
        <w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Participante</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Empresa / Depto</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>E-mail</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Visto</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:t>Thais Louise Barroso</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Afonso França / Suprimentos</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>thais.barroso@afonsofranca.com.br</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Visto</w:t></w:r></w:p></w:tc>
      </w:tr>
    </w:tbl>

    <w:p><w:r><w:t></w:t></w:r></w:p>

    <!-- TABELA 3: RESUMO EXECUTIVO E CONDIÇÕES COMERCIAIS -->
    <w:tbl>
      <w:tblPr><w:tblW w:w="0" w:type="auto"/></w:tblPr>
      <w:tr>
        <w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Resumo Executivo</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>[EXTRAIR DO FIRE FLIES]</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Condições Comerciais:</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Valor total: R$ XXXX em [xx] parcelas. Prazo de entrega: XXX dias.</w:t></w:r></w:p></w:tc>
      </w:tr>
    </w:tbl>

    <w:p><w:r><w:t></w:t></w:r></w:p>

    <!-- TABELA 4: CORPO PRINCIPAL DE DELIBERAÇÕES (4 COLUNAS) -->
    <w:tbl>
      <w:tblPr><w:tblW w:w="0" w:type="auto"/></w:tblPr>
      <w:tr>
        <w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Item</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Descrição / Deliberação</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Responsável</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Prazo</w:t></w:r></w:p></w:tc>
      </w:tr>
      <!-- Item 01: Objeto e Escopo -->
      <w:tr>
        <w:tc><w:p><w:r><w:t>01</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Objeto e Escopo do Fornecimento</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Contratada / Suprimentos</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Conforme cronograma</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:t></w:t></w:r></w:p></w:tc>
        <w:tc>
          <w:p><w:r><w:t>O fornecedor se compromete a executar a integralidade dos serviços de engenharia civil e fornecimento de materiais especificados na cotação inicial, respeitando as normas da ABNT e as diretrizes do Sistema de Gestão da Construtora Afonso França.</w:t></w:r></w:p>
          <w:p><w:r><w:t>Deverá ser garantida a disponibilidade contínua de insumos certificados, sendo obrigatória a entrega dos relatórios técnicos semanais de conformidade ao engenheiro fiscal da obra.</w:t></w:r></w:p>
        </w:tc>
        <w:tc><w:p><w:r><w:t>Contratada</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Imediato</w:t></w:r></w:p></w:tc>
      </w:tr>
      <!-- Item 02: Condições Comerciais e Faturamento -->
      <w:tr>
        <w:tc><w:p><w:r><w:t>02</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Condições Comerciais e Faturamento</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Financeiro / Fornecedor</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Mensal</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:t></w:t></w:r></w:p></w:tc>
        <w:tc>
          <w:p><w:r><w:t>Valor total: R$ XXXX em [xx] parcelas fixas. As medições serão realizadas no dia 25 de cada mês civil e o faturamento ocorrerá nos dias 10, 20 ou 30 após a validação final da medição pelo engenheiro de obra.</w:t></w:r></w:p>
        </w:tc>
        <w:tc><w:p><w:r><w:t>Fornecedor</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>dias 10, 20 ou 30</w:t></w:r></w:p></w:tc>
      </w:tr>
      <!-- Item 03: Retenção Contratual -->
      <w:tr>
        <w:tc><w:p><w:r><w:t>03</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Retenção de Garantia Técnica</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Financeiro</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>180 dias</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:t></w:t></w:r></w:p></w:tc>
        <w:tc>
          <w:p><w:r><w:t>Haverá retenção técnica de 5% sobre cada fatura/medição aprovada a título de garantia de boa execução. O montante acumulado será liberado após o termo de recebimento definitivo da obra, findo o prazo de 180 dias após a conclusão dos serviços.</w:t></w:r></w:p>
        </w:tc>
        <w:tc><w:p><w:r><w:t>Construtora</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>180 dias</w:t></w:r></w:p></w:tc>
      </w:tr>
      <!-- Item 04: Prazos e Cronograma -->
      <w:tr>
        <w:tc><w:p><w:r><w:t>04</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Prazos e Cronograma Executivo</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Planejamento</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>xx dias</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:t></w:t></w:r></w:p></w:tc>
        <w:tc>
          <w:p><w:r><w:t>Prazo de mobilização: xx dias após a emissão da Ordem de Serviço (OS). Prazo global de conclusão dos serviços de 120 dias corridos conforme cronograma físico-financeiro anexo ao contrato principal.</w:t></w:r></w:p>
        </w:tc>
        <w:tc><w:p><w:r><w:t>Fornecedor</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>120 dias</w:t></w:r></w:p></w:tc>
      </w:tr>
      <!-- Item 05: Documentação e ART -->
      <w:tr>
        <w:tc><w:p><w:r><w:t>05</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Documentação de Engenharia e ART</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Engenheiro Responsável</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>5 dias</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:t></w:t></w:r></w:p></w:tc>
        <w:tc>
          <w:p><w:r><w:t>Apresentação da Anotação de Responsabilidade Técnica (ART) com comprovante de recolhimento no prazo improrrogável de 5 dias úteis contados a partir da formalização deste instrumento de contratação.</w:t></w:r></w:p>
        </w:tc>
        <w:tc><w:p><w:r><w:t>Fornecedor</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>5 dias úteis</w:t></w:r></w:p></w:tc>
      </w:tr>
      <!-- Item 06: Segurança e Saúde Ocupacional -->
      <w:tr>
        <w:tc><w:p><w:r><w:t>06</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Segurança do Trabalho e PGR/PCMSO</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>SESMT / Contratada</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Antes da mobilização</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:t></w:t></w:r></w:p></w:tc>
        <w:tc>
          <w:p><w:r><w:t>Envio obrigatório de todos os ASOs, fichas de EPI, certificados de treinamento das NRs aplicáveis (NR-35, NR-10 e NR-18) e programas PGR/PCMSO integrados ao plano de segurança da obra.</w:t></w:r></w:p>
        </w:tc>
        <w:tc><w:p><w:r><w:t>Fornecedor</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Imediato</w:t></w:r></w:p></w:tc>
      </w:tr>
      <!-- Item 07: Qualidade e Ensaios -->
      <w:tr>
        <w:tc><w:p><w:r><w:t>07</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Controle Tecnológico e Ensaios</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Qualidade</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Contínuo</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:t></w:t></w:r></w:p></w:tc>
        <w:tc>
          <w:p><w:r><w:t>Fornecimento de laudos de ensaios laboratoriais e certificados de procedência de matéria-prima para cada lote entregue no canteiro, sob pena de recusa imediata de recebimento do material pelo almoxarifado.</w:t></w:r></w:p>
        </w:tc>
        <w:tc><w:p><w:r><w:t>Fornecedor</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Por lote</w:t></w:r></w:p></w:tc>
      </w:tr>
      <!-- Item 08: Meio Ambiente e Limpeza -->
      <w:tr>
        <w:tc><w:p><w:r><w:t>08</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Gestão Ambiental e Resíduos</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Engenharia de Obra</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Diário</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:t></w:t></w:r></w:p></w:tc>
        <w:tc>
          <w:p><w:r><w:t>O contratado é integralmente responsável pela segregação correta dos resíduos sólidos gerados por suas atividades, mantendo a frente de serviço limpa e desimpedida conforme plano PGRS da contratante.</w:t></w:r></w:p>
        </w:tc>
        <w:tc><w:p><w:r><w:t>Fornecedor</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Diário</w:t></w:r></w:p></w:tc>
      </w:tr>
      <!-- Item 09: Fornecimento de Ferramental e Equipamentos -->
      <w:tr>
        <w:tc><w:p><w:r><w:t>09</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Equipamentos, Ferramentas e Andaimes</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Produção / Contratada</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Conforme demanda</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:t></w:t></w:r></w:p></w:tc>
        <w:tc>
          <w:p><w:r><w:t>Todas as ferramentas, maquinários, andaimes tubulares e equipamentos auxiliares necessários para a perfeita execução são de responsabilidade e custeio exclusivo da contratada, devendo estar devidamente inspecionados.</w:t></w:r></w:p>
        </w:tc>
        <w:tc><w:p><w:r><w:t>Fornecedor</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Integral</w:t></w:r></w:p></w:tc>
      </w:tr>
      <!-- Item 10: Multas e Penalidades -->
      <w:tr>
        <w:tc><w:p><w:r><w:t>10</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Multas Contratuais por Atraso</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Jurídico / Suprimentos</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Por ocorrência</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:t></w:t></w:r></w:p></w:tc>
        <w:tc>
          <w:p><w:r><w:t>Em caso de atraso injustificado no cumprimento das metas dos marcos contratuais, aplicar-se-á multa moratória de 0,5% ao dia sobre o valor total do contrato, limitada a 10% do valor global.</w:t></w:r></w:p>
        </w:tc>
        <w:tc><w:p><w:r><w:t>Construtora</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Imediato</w:t></w:r></w:p></w:tc>
      </w:tr>
      <!-- Item 11: Garantia Quinquenal -->
      <w:tr>
        <w:tc><w:p><w:r><w:t>11</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Garantia Legal e Assistência Técnica</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Pós-Obra</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>5 anos</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:t></w:t></w:r></w:p></w:tc>
        <w:tc>
          <w:p><w:r><w:t>A garantia dos serviços e materiais segue estritamente o prazo legal de 5 anos conforme Código Civil Brasileiro, obrigando-se o fornecedor a atender chamados de assistência técnica no prazo máximo de 48 horas.</w:t></w:r></w:p>
        </w:tc>
        <w:tc><w:p><w:r><w:t>Fornecedor</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>48 horas</w:t></w:r></w:p></w:tc>
      </w:tr>
      <!-- Item 12: Subcontratação -->
      <w:tr>
        <w:tc><w:p><w:r><w:t>12</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Proibição de Subcontratação</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Gestão Contratual</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Permanente</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:t></w:t></w:r></w:p></w:tc>
        <w:tc>
          <w:p><w:r><w:t>É expressamente vedada a subcontratação total ou parcial do objeto pactuado sem a prévia e formal anuência por escrito da Diretoria de Engenharia da Afonso França.</w:t></w:r></w:p>
        </w:tc>
        <w:tc><w:p><w:r><w:t>Fornecedor</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Permanente</w:t></w:r></w:p></w:tc>
      </w:tr>
      <!-- Item 13: Alojamento e Alimentação -->
      <w:tr>
        <w:tc><w:p><w:r><w:t>13</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Alojamento, Transporte e Alimentação</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Recursos Humanos</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Mensal</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:t></w:t></w:r></w:p></w:tc>
        <w:tc>
          <w:p><w:r><w:t>O fornecimento de refeições, transporte seguro e alojamentos em conformidade com as normas regulamentadoras vigentes corre por conta e responsabilidade integral da contratada.</w:t></w:r></w:p>
        </w:tc>
        <w:tc><w:p><w:r><w:t>Fornecedor</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Contínuo</w:t></w:r></w:p></w:tc>
      </w:tr>
      <!-- Item 14: Confidencialidade e Compliance -->
      <w:tr>
        <w:tc><w:p><w:r><w:t>14</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Compliance, Ética e LGPD</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Compliance</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Permanente</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:t></w:t></w:r></w:p></w:tc>
        <w:tc>
          <w:p><w:r><w:t>As partes obrigam-se a guardar absoluto sigilo sobre todas as informações estratégicas do empreendimento e a respeitar os preceitos da Lei Geral de Proteção de Dados (LGPD) e o Código de Conduta da Contratante.</w:t></w:r></w:p>
        </w:tc>
        <w:tc><w:p><w:r><w:t>Ambas as partes</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Indeterminado</w:t></w:r></w:p></w:tc>
      </w:tr>
      <!-- Item 15: Foro e Resolução de Conflitos -->
      <w:tr>
        <w:tc><w:p><w:r><w:t>15</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Foro de Eleição e Encerramento</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Jurídico</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Imediato</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:t></w:t></w:r></w:p></w:tc>
        <w:tc>
          <w:p><w:r><w:t>Fica eleito o Foro da Comarca de São Paulo/SP para dirimir quaisquer dúvidas decorrentes do presente instrumento, com renúncia expressa a qualquer outro, por mais privilegiado que seja.</w:t></w:r></w:p>
        </w:tc>
        <w:tc><w:p><w:r><w:t>Diretoria</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Conclusivo</w:t></w:r></w:p></w:tc>
      </w:tr>
    </w:tbl>

    <w:p><w:r><w:t></w:t></w:r></w:p>

    <!-- TABELA 5: VISTOS E CLÁUSULAS FINAIS -->
    <w:tbl>
      <w:tblPr><w:tblW w:w="0" w:type="auto"/></w:tblPr>
      <w:tr>
        <w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Cláusulas Finais:</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>O presente instrumento consolida as deliberações da reunião de negociação.</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Vistos e Assinaturas:</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Afonso França Engenharia &amp; Contratada</w:t></w:r></w:p></w:tc>
      </w:tr>
    </w:tbl>

    <w:p><w:r><w:t></w:t></w:r></w:p>
  </w:body>
</w:document>`;

export function createOfficialTemplateDocx(): Buffer {
  const zip = new PizZip();
  zip.file('[Content_Types].xml', contentTypesXml);
  zip.file('_rels/.rels', relsXml);
  zip.file('word/_rels/document.xml.rels', wordRelsXml);
  zip.file('word/styles.xml', stylesXml);
  zip.file('word/document.xml', documentXml);

  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

const fixturesDir = path.resolve(process.cwd(), 'fixtures');
if (!fs.existsSync(fixturesDir)) {
  fs.mkdirSync(fixturesDir, { recursive: true });
}
const templatePath = path.join(fixturesDir, 'ATA_MODELO.docx');
fs.writeFileSync(templatePath, createOfficialTemplateDocx());
console.log('Fixture ATA_MODELO.docx gerada com sucesso em:', templatePath);
