resource "kubernetes_cluster_role" "cr_get_list_watch_all" {
  metadata {
    name = "cr-get-list-watch-all"

    annotations = {
      "rbac.authorization.kubernetes.io/autoupdate" = "true"
    }
  }

  rule {
    verbs      = ["get", "list", "watch"]
    api_groups = [""]
    resources  = ["*"]
  }

  rule {
    verbs      = ["get", "list", "watch"]
    api_groups = ["batch", "extensions", "apps"]
    resources  = ["*"]
  }
}

resource "kubernetes_cluster_role_binding" "crb_get_list_watch_all" {
  metadata {
    name = "crb-get-list-watch-all"
  }

  subject {
    kind = "User"
    name = "google-open-id-connect-developer"
  }

  role_ref {
    kind = "ClusterRole"
    name = "cr-get-list-watch-all"
    api_group = "rbac.authorization.k8s.io"
  }
}

resource "kubernetes_cluster_role_binding" "crb_sqlproxy" {
  metadata {
    name = "crb-sqlproxy"
  }

  subject {
    kind = "User"
    name = "google-open-id-connect-sqlproxy"
  }

  role_ref {
    kind = "ClusterRole"
    name = "cr-sqlproxy"
    api_group = "rbac.authorization.k8s.io"
  }
}

resource "kubernetes_namespace" "sql_forwarding" {
  metadata {
    name = "sql-forwarding"

    labels = {
      name = "sql-forwarding"
    }
  }
}

resource "kubernetes_role" "r_sql_forwarding" {
  metadata {
    name      = "r-sql-forwarding"
    namespace = "sql-forwarding"
  }

  rule {
    verbs      = ["get", "create", "delete", "patch", "list"]
    api_groups = [""]
    resources  = ["pods/portforward", "pods", "pods/exec", "namespaces"]
  }
}

resource "kubernetes_role_binding" "rb_sql_forwarding" {
  metadata {
    name      = "rb-sql-forwarding"
    namespace = "sql-forwarding"
  }

  subject {
    kind = "User"
    name = "google-open-id-connect-sqlproxy"
  }

  role_ref {
    api_group = "rbac.authorization.k8s.io"
    kind      = "Role"
    name      = "r-sql-forwarding"
  }
}
