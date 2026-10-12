#!/usr/bin/env bash
# The one lock for heavy runs (pnpm check, e2e suites): done.sh and integrate.sh both call this.
# macOS lockf holds the kernel lock; -k keeps its inode for every caller, even after a holder dies.
# The holder file is advisory only: it never decides whether a caller may run.
# usage: bash harness/with-lock.sh <command> [args...]
# HARNESS_LOCK overrides the lock file; HARNESS_TIMEOUT limits the command in seconds (default 1500).
set -uo pipefail
[ $# -eq 0 ] && { echo "usage: with-lock.sh <command> [args...]"; exit 2; }
lock=${HARNESS_LOCK:-/tmp/bower-heavy.lockf}
# Only a child of the holder inherits this lock's path and passes through.
[ "${HARNESS_LOCK_HELD:-}" = "$lock" ] && exec "$@"

# Keep output on the original stdout; fd 3 carries only the command status (including exit 75).
status_dir=$(mktemp -d "${TMPDIR:-/tmp}/bower-lock.XXXXXX") || exit 74
owner=$$
exec 4<&0
cleanup() {
  if [ -n "${locker:-}" ]; then
    if [ -f "$status_dir/supervisor" ] && kill -TERM "$(cat "$status_dir/supervisor")" 2>/dev/null; then
      wait "$locker" 2>/dev/null || true
    else
      kill -TERM "$locker" 2>/dev/null || true
      wait "$locker" 2>/dev/null || true
    fi
  fi
  rm -rf "$status_dir"
}
trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM
holding() {
  local lock=$1 owner=$2 status_dir=$3 result
  shift 3
  export HARNESS_LOCK_HELD="$lock"
  printf "%s\n%s\n%s\n" "$$" "$(date "+%F %T")" "$*" > "$lock.holder" || exit 74
  perl -e '
    use strict;
    use warnings;
    use Time::HiRes qw(time alarm);
    use POSIX qw(setpgid);
    my ($owner, $control, @command) = @ARGV;
    my $limit = $ENV{HARNESS_TIMEOUT} // 1500;
    die "HARNESS_TIMEOUT must be a positive number of seconds\n"
      unless $limit =~ /\A[0-9]+(?:\.[0-9]+)?\z/ && $limit > 0;
    my $pid;
    END { kill "KILL", -$pid if $pid; }
    $SIG{HUP} = sub { exit 129 };
    $SIG{INT} = sub { exit 130 };
    $SIG{TERM} = sub { exit 143 };
    $pid = fork();
    die "Cannot fork: $!\n" unless defined $pid;
    if ($pid == 0) {
      setpgrp(0, 0) or die "Cannot set process group: $!\n";
      $SIG{$_} = "DEFAULT" for qw(HUP INT TERM);
      exec { $command[0] } @command;
      die "Cannot execute command: $!\n";
    }
    # Establish the group from both sides before exposing the supervisor to signal cleanup.
    setpgid($pid, $pid);
    open my $file, ">", $control or die "Cannot record supervisor: $!\n";
    print {$file} "$$\n";
    close $file or die "Cannot close supervisor file: $!\n";
    my $deadline = time + $limit;
    $SIG{ALRM} = sub {
      exit 143 unless kill 0, $owner;
      my $left = $deadline - time;
      if ($left <= 0) { print STDERR "Heavy run timed out\n"; exit 124; }
      alarm($left < 1 ? $left : 1);
    };
    alarm($limit < 1 ? $limit : 1);
    while (waitpid($pid, 0) < 0) { die "Cannot wait for command: $!\n" unless $!{EINTR}; }
    my $result = $?;
    alarm(0);
    exit(($result & 127) ? 128 + ($result & 127) : $result >> 8);
  ' "$owner" "$status_dir/supervisor" "$@" 3>&-
  result=$?
  rm -f "$status_dir/supervisor"
  printf "%s\n" "$result" >&3
}
export -f holding
run_lock() {
  /usr/bin/lockf -k "$@" "$lock" bash -c 'holding "$@"' holder "$lock" "$owner" "$status_dir" "${command[@]}" 3>"$status_dir/result" 0<&4 4<&- &
  locker=$!
  wait "$locker"
  acquired=$?
  locker=
  result=$(cat "$status_dir/result")
}
command=("$@")
run_lock -t 0
if [ "$acquired" -eq 75 ]; then
  pid=unknown; started=unknown; cmd=unknown
  # Missing, empty or partially written metadata cannot affect the kernel lock.
  if [ -f "$lock.holder" ]; then
    { read -r pid; read -r started; read -r cmd; } < "$lock.holder"
  fi
  echo "Waiting: another heavy run holds the lock (pid $pid, $cmd, started $started)"
  run_lock
fi
[ "$acquired" -ne 0 ] && exit "$acquired"
exit "$result"
