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
      <w:tr>
        <w:tc><w:p><w:r><w:t>01</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Descrição inicial da deliberação ou regra da obra.</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Contratada / Suprimentos</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Conforme cronograma</w:t></w:r></w:p></w:tc>
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
