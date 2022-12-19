import { Probot, ProbotOctokit } from "probot";
import { Configuration, OpenAIApi } from "openai";
import {
  generateEditedMessage,
  generateAddedMessage,
} from "./message-generators";
import { COMMANDS } from "./constants";

const configuration = new Configuration({
  organization: process.env.OPENAI_ORGANIZATION,
  apiKey: process.env.OPENAI_API_KEY,
});

const openai = new OpenAIApi(configuration);

export = (app: Probot) => {
  // listen for pull request review comment creation
  app.on("pull_request_review_comment.created", async (context) => {
    if (context.isBot) return;
    // console.log(context.payload);

    let repository = context.payload.repository;
    let comment = context.payload.comment;

    let comment_body = comment.body.trimStart();

    // get the code
    let code;
    if (
      comment_body.startsWith(COMMANDS.EDIT) ||
      comment_body.startsWith(COMMANDS.COMPLETE)
    ) {
      code = await getCodeFromPreviousComment(
        context.octokit,
        repository.owner.login,
        repository.name,
        context.payload.pull_request.number,
        comment.in_reply_to_id!,
        comment
      );
    } else if (comment_body.startsWith(COMMANDS.RESET)) {
      code = await getCodeOnLines(
        context.octokit,
        repository.owner.login,
        repository.name,
        comment.path,
        comment.commit_id,
        comment.start_line,
        comment.line!
      );
    }
    if (!code) return;

    // get the result + message depending on the command
    let result, message;
    if (comment_body.startsWith(COMMANDS.EDIT)) {
      result = await getEdit(
        code!,
        comment_body.substring(COMMANDS.EDIT.length).trimStart()
      );
      message = generateEditedMessage(result || "");
    } else if (comment_body.startsWith(COMMANDS.RESET)) {
      result = await getEdit(
        code!,
        comment_body.substring(COMMANDS.RESET.length).trimStart()
      );
      message = generateEditedMessage(result || "");
    } else if (comment_body.startsWith(COMMANDS.COMPLETE)) {
      result = await getCode(code);
      message = generateAddedMessage(code, result || "");
    } else {
      // unknown command
      return;
    }
    if (!result) return;

    // create a comment with the result
    await context.octokit.pulls.createReplyForReviewComment({
      owner: repository.owner.login,
      repo: repository.name,
      pull_number: context.payload.pull_request.number,
      comment_id: comment.id,
      body: message,
    });
  });
};

async function getCodeOnLines(
  octokit: InstanceType<typeof ProbotOctokit>,
  owner: string,
  repo: string,
  path: string,
  commit_id: string,
  start_line: number | null,
  end_line: number
): Promise<string | undefined> {
  // get the file on which the comment is on
  let content = await octokit.repos.getContent({
    owner: owner,
    repo: repo,
    path: path,
    ref: commit_id,
  });

  // get the sha of the file
  let sha = (content.data as { sha: string }).sha;

  // fetch the blob from github database
  let resp = await octokit.rest.git.getBlob({
    owner: owner,
    repo: repo,
    file_sha: sha,
  });

  // Decode file from base64
  let wholeFile = Buffer.from(resp.data.content, "base64").toString();

  if (start_line == null) {
    start_line = end_line;
  }

  // find the lines of code of the review comment
  let code = wholeFile
    .split("\n")
    .slice(start_line - 1, end_line)
    .join("\n");

  return code;
}

async function getCodeFromPreviousComment(
  octokit: InstanceType<typeof ProbotOctokit>,
  owner: string,
  repo: string,
  pull_number: number,
  in_reply_to_id: number,
  comment: any
): Promise<string | undefined> {
  let codeBody;
  for await (const response of octokit.paginate.iterator(
    octokit.rest.pulls.listReviewComments,
    {
      owner: owner,
      repo: repo,
      pull_number: pull_number,
      sort: "created",
      direction: "desc",
      per_page: 100,
    }
  )) {
    let res = response.data.filter(
      (val) =>
        val.in_reply_to_id == in_reply_to_id &&
        val.body.trimStart().startsWith("<!--- generated by candle-fixer -->")
    );
    if (res.length > 0) {
      codeBody = res[0].body;
      break;
    }
  }

  if (!codeBody) {
    return getCodeOnLines(
      octokit,
      owner,
      repo,
      comment.path,
      comment.commit_id,
      comment.start_line,
      comment.line!
    );
  }
  let lines = codeBody.split("\n");
  let codeBlock = lines.slice(4, lines.length - 2).join("\n");
  return codeBlock;
}

async function getEdit(
  codeContext: string,
  feedback: string
): Promise<string | undefined> {
  console.log(feedback);
  console.log(codeContext);
  try {
    let response = await openai.createEdit({
      model: "code-davinci-edit-001",
      input: codeContext,
      instruction: feedback,
      temperature: 0,
    });
    return response.data.choices[0].text;
  } catch (e) {
    console.error(e);
    return undefined;
  }
}

async function getCode(codeContext: string): Promise<string | undefined> {
  try {
    let response = await openai.createCompletion({
      model: "code-davinci-002",
      prompt: codeContext,
      temperature: 0,
      max_tokens: 256,
    });
    return response.data.choices[0].text;
  } catch (e) {
    console.error(e);
    return undefined;
  }
}
